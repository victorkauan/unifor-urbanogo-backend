import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type AppInstance } from "../../app.js";
import { resetDatabase } from "../../../test/db.js";
import { createTestUser } from "../../../test/fixtures.js";

const shouldRun = process.env.RUN_DB_TESTS === "1";

describe.runIf(shouldRun)("offer accept/reject routes", () => {
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

  async function registerDriver(suffix: string) {
    const email = `driver-${suffix}-${Date.now()}@example.com`;
    const password = "password123";
    const registered = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { name: `Driver ${suffix}`, email, password, role: "driver" },
    });
    const userId = registered.json().id as string;

    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password },
    });
    const token = login.json().token as string;

    return { userId, token };
  }

  async function onlineDriver(suffix: string, lat: number, lng: number) {
    const { userId, token } = await registerDriver(suffix);
    const driver = await app.prisma.driver.create({
      data: {
        userId,
        servicePreference: "both",
        isOnline: true,
        vehicleModel: "Onix",
        vehiclePlate: "ABC1D23",
      },
    });
    await app.prisma.driverLocation.create({
      data: { driverId: driver.id, lat, lng, recordedAt: new Date() },
    });
    return { userId, token, driver };
  }

  async function searchingRide() {
    const passenger = await createTestUser(app.prisma);
    return app.prisma.ride.create({
      data: {
        passengerId: passenger.id,
        type: "ride",
        status: "searching",
        originLat: -3.7319,
        originLng: -38.5267,
        destLat: -3.75,
        destLng: -38.49,
      },
    });
  }

  async function currentOffer(rideId: string) {
    const offer = await app.prisma.rideOffer.findFirst({
      where: { rideId },
      orderBy: { offeredAt: "desc" },
    });
    if (!offer) {
      throw new Error("no offer created");
    }
    return offer;
  }

  it("assigns the ride to the driver who accepts", async () => {
    const driver = await onlineDriver("accept", -3.732, -38.527);
    const ride = await searchingRide();
    await app.matching.start(ride.id);
    const offer = await currentOffer(ride.id);

    const res = await app.inject({
      method: "POST",
      url: `/offers/${offer.id}/accept`,
      headers: { authorization: `Bearer ${driver.token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status_code: 200,
      data: { ride: { status: "assigned", driver: { id: driver.driver.id } } },
    });

    const stored = await app.prisma.ride.findUnique({ where: { id: ride.id } });
    expect(stored?.status).toBe("assigned");
    expect(stored?.driverId).toBe(driver.driver.id);
  });

  it("moves the offer to the next driver on reject", async () => {
    const first = await onlineDriver("r1", -3.732, -38.527);
    const second = await onlineDriver("r2", -3.735, -38.53);
    const ride = await searchingRide();
    await app.matching.start(ride.id);
    const firstOffer = await currentOffer(ride.id);

    const res = await app.inject({
      method: "POST",
      url: `/offers/${firstOffer.id}/reject`,
      headers: { authorization: `Bearer ${first.token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status_code: 200, data: null });

    const rejected = await app.prisma.rideOffer.findUnique({ where: { id: firstOffer.id } });
    expect(rejected?.status).toBe("rejected");
    const nextOffer = await currentOffer(ride.id);
    expect(nextOffer.driverId).toBe(second.driver.id);
  });

  it("rejects the request without a token", async () => {
    const driver = await onlineDriver("noauth", -3.732, -38.527);
    const ride = await searchingRide();
    await app.matching.start(ride.id);
    const offer = await currentOffer(ride.id);
    void driver;

    const res = await app.inject({ method: "POST", url: `/offers/${offer.id}/accept` });
    expect(res.statusCode).toBe(401);
  });

  it("forbids accepting an offer that belongs to another driver", async () => {
    await onlineDriver("owner", -3.732, -38.527);
    const intruder = await registerDriver("intruder");
    const ride = await searchingRide();
    await app.matching.start(ride.id);
    const offer = await currentOffer(ride.id);

    const res = await app.inject({
      method: "POST",
      url: `/offers/${offer.id}/accept`,
      headers: { authorization: `Bearer ${intruder.token}` },
    });

    expect(res.statusCode).toBe(403);
  });

  it("returns 409 when accepting an offer that is no longer pending", async () => {
    const driver = await onlineDriver("twice", -3.732, -38.527);
    const ride = await searchingRide();
    await app.matching.start(ride.id);
    const offer = await currentOffer(ride.id);

    const headers = { authorization: `Bearer ${driver.token}` };
    const first = await app.inject({ method: "POST", url: `/offers/${offer.id}/accept`, headers });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({ method: "POST", url: `/offers/${offer.id}/accept`, headers });
    expect(second.statusCode).toBe(409);
  });

  it("returns 422 for a malformed offer id", async () => {
    const { token } = await registerDriver("bad-id");
    const res = await app.inject({
      method: "POST",
      url: "/offers/not-a-uuid/accept",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({
      status_code: 422,
      message: "Payload inválido",
      data: { errors: expect.any(Array) },
    });
  });
});
