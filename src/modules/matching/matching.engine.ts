import type { PrismaClient, Ride } from "@prisma/client";
import type { Redis } from "ioredis";
import { ConflictError, ForbiddenError, NotFoundError } from "../../lib/errors.js";
import { haversineKm } from "../../lib/geo.js";
import { matchingQueueSize, matchingSearchDuration } from "../../lib/metrics.js";
import { calculateFare } from "../pricing/pricing.service.js";
import { findNearbyOnlineDrivers } from "../rides/nearby-drivers.js";
import { assertRideTransition } from "../rides/ride-state-machine.js";
import { normalizeTrust, rankCandidates, type RankableCandidate } from "./candidate-ranking.js";
import { DEFAULT_MATCHING_CONFIG, type MatchingConfig } from "./matching.config.js";
import {
  getSearchState,
  saveSearchState,
  type MatchingSearchState,
} from "./matching-state.repo.js";
import type { MatchingNotifier } from "./matching.notifier.js";

export interface Scheduler {
  schedule(delayMs: number, fn: () => void | Promise<void>): { cancel(): void };
}

export const realScheduler: Scheduler = {
  schedule(delayMs, fn) {
    const handle = setTimeout(() => {
      void Promise.resolve(fn()).catch(() => {});
    }, delayMs);
    handle.unref?.();
    return { cancel: () => clearTimeout(handle) };
  },
};

export interface TrustProvider {
  getTrust(userId: string): Promise<number>;
}

export interface MatchingLogger {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
}

const NOOP_LOGGER: MatchingLogger = {
  info() {},
  warn() {},
  error() {},
};

export interface MatchingEngineDeps {
  prisma: PrismaClient;
  redis: Redis;
  notifier: MatchingNotifier;
  trust: TrustProvider;
  scheduler?: Scheduler;
  config?: MatchingConfig;
  logger?: MatchingLogger;
  now?: () => number;
}

export type MatchingFailureReason =
  "no_drivers_available" | "drivers_exhausted" | "timeout" | "cancelled";

interface ActiveTimers {
  global: { cancel(): void };
  offer?: { cancel(): void };
}

export class MatchingEngine {
  private readonly prisma: PrismaClient;
  private readonly redis: Redis;
  private readonly notifier: MatchingNotifier;
  private readonly trust: TrustProvider;
  private readonly scheduler: Scheduler;
  private readonly config: MatchingConfig;
  private readonly logger: MatchingLogger;
  private readonly now: () => number;
  private readonly timers = new Map<string, ActiveTimers>();

  constructor(deps: MatchingEngineDeps) {
    this.prisma = deps.prisma;
    this.redis = deps.redis;
    this.notifier = deps.notifier;
    this.trust = deps.trust;
    this.scheduler = deps.scheduler ?? realScheduler;
    this.config = deps.config ?? DEFAULT_MATCHING_CONFIG;
    this.logger = deps.logger ?? NOOP_LOGGER;
    this.now = deps.now ?? (() => Date.now());
  }

  async start(rideId: string): Promise<void> {
    const ride = await this.loadRide(rideId);
    if (ride.status !== "searching") {
      throw new ConflictError(`A corrida não está em busca de motorista`, {
        status: ride.status,
      });
    }

    const startedAtMs = this.now();
    const nearby = await findNearbyOnlineDrivers(this.prisma, {
      origin: { lat: ride.originLat, lng: ride.originLng },
      radiusKm: this.config.searchRadiusKm,
      serviceType: ride.type,
      limit: this.config.maxCandidates,
    });

    const available = await this.dropBusyDrivers(nearby);
    const candidates: RankableCandidate[] = await Promise.all(
      available.map(async (driver) => ({
        driverId: driver.driverId,
        userId: driver.userId,
        distanceKm: driver.distanceKm,
        trust: normalizeTrust(await this.trust.getTrust(driver.userId)),
      })),
    );

    if (candidates.length === 0) {
      await this.fail(rideId, "no_drivers_available");
      return;
    }

    const queue = rankCandidates(candidates, this.config.distanceTrustTradeoffKm);
    const state: MatchingSearchState = {
      rideId,
      status: "searching",
      startedAt: new Date(startedAtMs).toISOString(),
      deadlineAt: new Date(startedAtMs + this.config.globalTimeoutMs).toISOString(),
      queue,
      currentIndex: -1,
      currentOfferId: null,
    };
    await saveSearchState(this.redis, state, this.config.stateTtlSeconds);

    const global = this.scheduler.schedule(this.config.globalTimeoutMs, async () => {
      try {
        await this.fail(rideId, "timeout");
      } catch (err) {
        this.logger.error({ err, rideId }, "falha ao expirar busca por timeout global");
      }
    });
    this.timers.set(rideId, { global });
    this.updateQueueGauge();

    await this.offerNext(rideId);
    this.logger.info(
      { rideId, candidates: queue.length, ms: this.now() - startedAtMs },
      "matching search started",
    );
  }

  async handleReject(offerId: string, driverUserId: string): Promise<void> {
    const offer = await this.requirePendingOffer(offerId, driverUserId);
    await this.prisma.rideOffer.update({
      where: { id: offerId },
      data: { status: "rejected", respondedAt: new Date(this.now()) },
    });

    const state = await getSearchState(this.redis, offer.rideId);
    if (state?.status === "searching" && state.currentOfferId === offerId) {
      this.timers.get(offer.rideId)?.offer?.cancel();
      await this.offerNext(offer.rideId);
    }
  }

  async handleAccept(offerId: string, driverUserId: string): Promise<Ride> {
    const offer = await this.requirePendingOffer(offerId, driverUserId);

    if (offer.expiresAt.getTime() <= this.now()) {
      await this.prisma.rideOffer.updateMany({
        where: { id: offerId, status: "pending" },
        data: { status: "timed_out", respondedAt: new Date(this.now()) },
      });
      throw new ConflictError("Esta oferta expirou");
    }

    const ride = await this.loadRide(offer.rideId);
    assertRideTransition(ride.status, "assigned");

    const assignedAt = new Date(this.now());
    const [, updatedRide] = await this.prisma.$transaction([
      this.prisma.rideOffer.update({
        where: { id: offerId },
        data: { status: "accepted", respondedAt: assignedAt },
      }),
      this.prisma.ride.update({
        where: { id: offer.rideId },
        data: { status: "assigned", driverId: offer.driverId, assignedAt },
      }),
      this.prisma.rideOffer.updateMany({
        where: { rideId: offer.rideId, status: "pending", id: { not: offerId } },
        data: { status: "cancelled", respondedAt: assignedAt },
      }),
    ]);

    this.stopTimers(offer.rideId);
    const state = await getSearchState(this.redis, offer.rideId);
    this.observeSearchDuration(state?.startedAt, "assigned");
    if (state) {
      await saveSearchState(
        this.redis,
        { ...state, status: "assigned", currentOfferId: offerId },
        this.config.stateTtlSeconds,
      );
    }

    const driver = await this.prisma.driver.findUnique({
      where: { id: offer.driverId },
      include: { user: true },
    });
    this.notifier.statusToRide(offer.rideId, {
      ride_id: offer.rideId,
      status: "assigned",
      driver: driver
        ? {
            id: driver.id,
            name: driver.user.name,
            vehicle_model: driver.vehicleModel,
            vehicle_plate: driver.vehiclePlate,
          }
        : undefined,
      updated_at: assignedAt.toISOString(),
    });

    this.logger.info({ rideId: offer.rideId, offerId }, "matching offer accepted");
    return updatedRide;
  }

  async cancel(
    rideId: string,
    cancelledBy: "passenger" | "driver" | "system" = "system",
    reason?: string | null,
  ): Promise<void> {
    await this.fail(rideId, "cancelled", cancelledBy, reason);
  }

  private async offerNext(rideId: string): Promise<void> {
    const state = await getSearchState(this.redis, rideId);
    if (!state || state.status !== "searching") {
      return;
    }

    const nextIndex = state.currentIndex + 1;
    const candidate = state.queue[nextIndex];
    if (!candidate) {
      await this.fail(rideId, "drivers_exhausted");
      return;
    }

    const ride = await this.loadRide(rideId);
    const offeredAtMs = this.now();
    const expiresAtMs = offeredAtMs + this.config.offerTimeoutMs;

    const offer = await this.prisma.rideOffer.create({
      data: {
        rideId,
        driverId: candidate.driverId,
        position: nextIndex,
        status: "pending",
        offeredAt: new Date(offeredAtMs),
        expiresAt: new Date(expiresAtMs),
      },
    });

    await saveSearchState(
      this.redis,
      { ...state, currentIndex: nextIndex, currentOfferId: offer.id },
      this.config.stateTtlSeconds,
    );

    const passengerTrust = normalizeTrust(await this.trust.getTrust(ride.passengerId));
    this.notifier.offerToDriver(candidate.userId, {
      offer_id: offer.id,
      ride_id: rideId,
      expires_at: new Date(expiresAtMs).toISOString(),
      pickup: {
        lat: ride.originLat,
        lng: ride.originLng,
        address: ride.originAddress ?? undefined,
      },
      dropoff: { lat: ride.destLat, lng: ride.destLng, address: ride.destAddress ?? undefined },
      passenger: { name: ride.passenger.name, trust_score: passengerTrust },
      distance_to_pickup_meters: Math.round(candidate.distanceKm * 1000),
      price_cents: ride.priceCents ?? this.estimatePrice(ride),
    });

    const previous = this.timers.get(rideId);
    previous?.offer?.cancel();
    const offerTimer = this.scheduler.schedule(this.config.offerTimeoutMs, async () => {
      try {
        await this.onOfferTimeout(rideId, offer.id);
      } catch (err) {
        this.logger.error(
          { err, rideId, offerId: offer.id },
          "falha ao processar timeout de oferta",
        );
      }
    });
    this.timers.set(rideId, {
      global: previous?.global ?? { cancel() {} },
      offer: offerTimer,
    });
    this.updateQueueGauge();
  }

  private async onOfferTimeout(rideId: string, offerId: string): Promise<void> {
    const state = await getSearchState(this.redis, rideId);
    if (!state || state.status !== "searching" || state.currentOfferId !== offerId) {
      return;
    }
    await this.prisma.rideOffer.updateMany({
      where: { id: offerId, status: "pending" },
      data: { status: "timed_out", respondedAt: new Date(this.now()) },
    });
    this.logger.info({ rideId, offerId }, "matching offer timed out");
    await this.offerNext(rideId);
  }

  private async fail(
    rideId: string,
    reason: MatchingFailureReason,
    cancelledBy: "passenger" | "driver" | "system" = "system",
    cancelledReason?: string | null,
  ): Promise<void> {
    const state = await getSearchState(this.redis, rideId);
    if (state && state.status !== "searching") {
      return;
    }

    this.observeSearchDuration(state?.startedAt, reason);
    this.stopTimers(rideId);
    await this.prisma.rideOffer.updateMany({
      where: { rideId, status: "pending" },
      data: { status: "timed_out", respondedAt: new Date(this.now()) },
    });

    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      select: { status: true },
    });
    const nextStatus = reason === "cancelled" ? "cancelled" : "expired";
    if (ride?.status === "searching") {
      await this.prisma.ride.update({
        where: { id: rideId },
        data:
          nextStatus === "cancelled"
            ? {
                status: "cancelled",
                cancelledBy,
                cancelledAt: new Date(this.now()),
                cancelledReason: cancelledReason ?? null,
              }
            : { status: "expired" },
      });
    }

    if (state) {
      await saveSearchState(
        this.redis,
        { ...state, status: nextStatus },
        this.config.stateTtlSeconds,
      );
    }

    this.notifier.cancelToRide(rideId, reason);
    this.logger.info({ rideId, reason }, "matching search ended without a match");
  }

  stopAll(): void {
    for (const rideId of [...this.timers.keys()]) {
      this.stopTimers(rideId);
    }
  }

  /**
   * Fecha buscas/ofertas travadas que passaram do próprio prazo sem ninguém
   * pra fechá-las - acontece quando o processo reinicia com buscas em
   * andamento (stopAll() cancela os timers em memória sem atualizar o
   * Postgres) ou quando um timer chega a disparar mas o callback falha
   * (mesmo agora logando o erro, a corrida/oferta fica parada até algo
   * reprocessar). Sem isso, o motorista de uma oferta "pending" travada fica
   * permanentemente fora do matching (dropBusyDrivers) mesmo livre de
   * verdade. Idempotente - seguro de chamar em intervalo (ver
   * plugins/matching.ts).
   */
  async reconcileStale(): Promise<{ offers: number; searches: number }> {
    const now = new Date(this.now());

    const staleOffers = await this.prisma.rideOffer.updateMany({
      where: { status: "pending", expiresAt: { lt: now } },
      data: { status: "timed_out", respondedAt: now },
    });

    const searchDeadline = new Date(this.now() - this.config.globalTimeoutMs);
    const staleSearches = await this.prisma.ride.findMany({
      where: { status: "searching", requestedAt: { lt: searchDeadline } },
      select: { id: true },
    });
    for (const { id: rideId } of staleSearches) {
      try {
        await this.fail(rideId, "timeout");
      } catch (err) {
        this.logger.error({ err, rideId }, "falha ao reconciliar busca travada");
      }
    }

    if (staleOffers.count > 0 || staleSearches.length > 0) {
      this.logger.warn(
        { staleOffers: staleOffers.count, staleSearches: staleSearches.length },
        "reconciliação encontrou buscas/ofertas travadas",
      );
    }

    return { offers: staleOffers.count, searches: staleSearches.length };
  }

  private stopTimers(rideId: string): void {
    const timers = this.timers.get(rideId);
    timers?.offer?.cancel();
    timers?.global.cancel();
    this.timers.delete(rideId);
    this.updateQueueGauge();
  }

  private updateQueueGauge(): void {
    matchingQueueSize.set(this.timers.size);
  }

  private observeSearchDuration(startedAt: string | undefined, outcome: string): void {
    if (!startedAt) {
      return;
    }
    matchingSearchDuration.observe({ outcome }, (this.now() - Date.parse(startedAt)) / 1000);
  }

  private estimatePrice(ride: {
    originLat: number;
    originLng: number;
    destLat: number;
    destLng: number;
    distanceMeters: number | null;
  }): number {
    const distanceMeters =
      ride.distanceMeters ??
      Math.round(
        haversineKm(
          { lat: ride.originLat, lng: ride.originLng },
          { lat: ride.destLat, lng: ride.destLng },
        ) * 1000,
      );
    return calculateFare({ distanceMeters }).amount_cents;
  }

  private async dropBusyDrivers<T extends { driverId: string }>(drivers: T[]): Promise<T[]> {
    if (drivers.length === 0) {
      return drivers;
    }
    const driverIds = drivers.map((driver) => driver.driverId);
    const [pendingOffers, activeRides] = await Promise.all([
      this.prisma.rideOffer.findMany({
        where: { driverId: { in: driverIds }, status: "pending" },
        select: { driverId: true },
      }),
      this.prisma.ride.findMany({
        where: { driverId: { in: driverIds }, status: { in: ["assigned", "in_progress"] } },
        select: { driverId: true },
      }),
    ]);
    const busy = new Set([
      ...pendingOffers.map((offer) => offer.driverId),
      ...activeRides.map((ride) => ride.driverId),
    ]);
    return drivers.filter((driver) => !busy.has(driver.driverId));
  }

  private async requirePendingOffer(offerId: string, driverUserId: string) {
    const offer = await this.prisma.rideOffer.findUnique({
      where: { id: offerId },
      include: { driver: true },
    });
    if (!offer) {
      throw new NotFoundError(`Oferta não encontrada`);
    }
    if (offer.driver.userId !== driverUserId) {
      throw new ForbiddenError("Esta oferta não pertence a este motorista");
    }
    if (offer.status !== "pending") {
      throw new ConflictError(`Esta oferta não está mais pendente`, { status: offer.status });
    }
    return offer;
  }

  private async loadRide(rideId: string) {
    const ride = await this.prisma.ride.findUnique({
      where: { id: rideId },
      include: { passenger: true, driver: true },
    });
    if (!ride) {
      throw new NotFoundError(`Corrida não encontrada`);
    }
    return ride;
  }
}
