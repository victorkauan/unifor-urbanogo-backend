import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type AppInstance } from "../../app.js";
import { resetDatabase } from "../../../test/db.js";

const shouldRun = process.env.RUN_DB_TESTS === "1";

/**
 * TST-3: um único cenário que percorre o caminho principal por dentro do backend,
 * só via HTTP (`app.inject`): cadastro, login implícito no cadastro, motorista
 * online, solicitação da corrida, matching, oferta, aceite, chegada, início,
 * conclusão e avaliação mútua. Roda contra o Postgres e o Redis reais do
 * globalSetup (URB-31), no CI via `services:`.
 */
describe.runIf(shouldRun)("ride flow end to end", () => {
  let app: AppInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterEach(async () => {
    app.matching.stopAll();
    await app.redis.flushall();
    await resetDatabase(app.prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  async function register(role: "passenger" | "driver") {
    const email = `e2e-${role}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { name: role, email, password: "password123", role },
    });
    expect(res.statusCode).toBe(201);
    return {
      userId: res.json().data.user.id as string,
      token: res.json().data.token as string,
    };
  }

  function auth(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  async function waitForOfferId(rideId: string): Promise<string> {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const offer = await app.prisma.rideOffer.findFirst({
        where: { rideId },
        orderBy: { offeredAt: "desc" },
      });
      if (offer) {
        return offer.id;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error("matching never produced an offer");
  }

  it("carries one ride from request to mutual rating through the HTTP API", async () => {
    // motorista: cadastro, perfil, posição e disponibilidade
    const driver = await register("driver");
    const profile = await app.inject({
      method: "POST",
      url: "/drivers/me",
      headers: auth(driver.token),
      payload: { service_preference: "both", vehicle_model: "Onix", vehicle_plate: "ABC1D23" },
    });
    expect(profile.statusCode).toBe(201);
    const driverId = profile.json().data.driver.id as string;

    // não há rota REST para a posição (chega por WebSocket e vai pro Redis);
    // o matching lê a tabela driver_locations, então semeamos a última posição.
    await app.prisma.driverLocation.create({
      data: { driverId, lat: -3.732, lng: -38.527, recordedAt: new Date() },
    });

    const availability = await app.inject({
      method: "PUT",
      url: "/drivers/me/availability",
      headers: auth(driver.token),
      payload: { is_online: true },
    });
    expect(availability.statusCode).toBe(200);
    expect(availability.json().data.is_online).toBe(true);

    // passageiro solicita a corrida
    const passenger = await register("passenger");
    const request = await app.inject({
      method: "POST",
      url: "/rides",
      headers: auth(passenger.token),
      payload: {
        type: "ride",
        origin: { lat: -3.7319, lng: -38.5267, address: "Rua das Flores, 100" },
        destination: { lat: -3.75, lng: -38.49 },
      },
    });
    expect(request.statusCode).toBe(201);
    const ride = request.json().data.ride;
    expect(ride.status).toBe("searching");
    expect(ride.price_cents).toBeGreaterThan(0);
    const rideId = ride.id as string;

    // matching gera a oferta e o motorista aceita
    const offerId = await waitForOfferId(rideId);
    const accept = await app.inject({
      method: "POST",
      url: `/offers/${offerId}/accept`,
      headers: auth(driver.token),
    });
    expect(accept.statusCode).toBe(200);
    expect(accept.json().data.ride).toMatchObject({
      status: "assigned",
      driver: { id: driverId },
    });

    // chegada, início e conclusão pelo motorista
    const arrive = await app.inject({
      method: "POST",
      url: `/rides/${rideId}/arrive`,
      headers: auth(driver.token),
    });
    expect(arrive.statusCode).toBe(200);
    expect(arrive.json().data.ride.arrived_at).not.toBeNull();

    const start = await app.inject({
      method: "POST",
      url: `/rides/${rideId}/start`,
      headers: auth(driver.token),
    });
    expect(start.statusCode).toBe(200);
    expect(start.json().data.ride.status).toBe("in_progress");

    const complete = await app.inject({
      method: "POST",
      url: `/rides/${rideId}/complete`,
      headers: auth(driver.token),
    });
    expect(complete.statusCode).toBe(200);
    expect(complete.json().data.ride.status).toBe("completed");

    // avaliação mútua
    const passengerRates = await app.inject({
      method: "POST",
      url: `/rides/${rideId}/ratings`,
      headers: auth(passenger.token),
      payload: { score: 5, comment: "Tranquilo e pontual" },
    });
    expect(passengerRates.statusCode).toBe(201);
    expect(passengerRates.json().data.rating).toMatchObject({
      ratee_id: driver.userId,
      score: 5,
    });

    const driverRates = await app.inject({
      method: "POST",
      url: `/rides/${rideId}/ratings`,
      headers: auth(driver.token),
      payload: { score: 4 },
    });
    expect(driverRates.statusCode).toBe(201);
    expect(driverRates.json().data.rating.ratee_id).toBe(passenger.userId);

    // estado final persistido
    const stored = await app.prisma.ride.findUniqueOrThrow({ where: { id: rideId } });
    expect(stored.status).toBe("completed");
    expect(stored.driverId).toBe(driverId);
    expect(stored.arrivedAt).not.toBeNull();
    expect(stored.startedAt).not.toBeNull();
    expect(stored.completedAt).not.toBeNull();
    expect(await app.prisma.rating.count({ where: { rideId } })).toBe(2);

    // a nota de confiança reflete a avaliação recebida
    const trust = await app.inject({
      method: "GET",
      url: `/users/${driver.userId}/trust-score`,
      headers: auth(passenger.token),
    });
    expect(trust.statusCode).toBe(200);
    expect(trust.json().data.trust_score).toMatchObject({ score: 1, source: "stub" });
  });
});
