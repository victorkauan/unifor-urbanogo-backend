import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { buildApp, type AppInstance } from "../../app.js";
import { resetDatabase } from "../../../test/db.js";
import { createTestUser } from "../../../test/fixtures.js";
import { rideDuration } from "../../lib/metrics.js";

const shouldRun = process.env.RUN_DB_TESTS === "1";

const VALID_BODY = {
  type: "ride" as const,
  origin: { lat: -3.7319, lng: -38.5267, address: "Rua das Flores, 100" },
  destination: { lat: -3.75, lng: -38.49 },
};

async function waitFor(check: () => Promise<boolean>, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("condition not met within timeout");
}

describe.runIf(shouldRun)("ride request routes", () => {
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

  async function passengerToken() {
    const email = `passenger-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { name: "Passenger", email, password: "password123", role: "passenger" },
    });
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password: "password123" },
    });
    return { email, token: login.json().data.token as string };
  }

  async function onlineDriverNearby() {
    const user = await createTestUser(app.prisma, { role: "driver" });
    const driver = await app.prisma.driver.create({
      data: {
        userId: user.id,
        servicePreference: "both",
        isOnline: true,
        vehicleModel: "Onix",
        vehiclePlate: "ABC1D23",
      },
    });
    await app.prisma.driverLocation.create({
      data: { driverId: driver.id, lat: -3.732, lng: -38.527, recordedAt: new Date() },
    });
    return driver;
  }

  async function onlineDriverWithToken() {
    const email = `rdriver-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const register = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { name: "Driver", email, password: "password123", role: "driver" },
    });
    const userId = register.json().data.user.id as string;
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password: "password123" },
    });
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
      data: { driverId: driver.id, lat: -3.732, lng: -38.527, recordedAt: new Date() },
    });
    return { userId, token: login.json().data.token as string, driver };
  }

  it("creates a searching ride and dispatches matching", async () => {
    await onlineDriverNearby();
    const { token } = await passengerToken();

    const res = await app.inject({
      method: "POST",
      url: "/rides",
      headers: { authorization: `Bearer ${token}` },
      payload: VALID_BODY,
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      status_code: 201,
      data: {
        ride: {
          type: "ride",
          status: "searching",
          origin: { lat: -3.7319, lng: -38.5267, address: "Rua das Flores, 100" },
          destination: { lat: -3.75, lng: -38.49 },
        },
      },
    });
    expect(res.json().data.ride.price_cents).toBeGreaterThan(0);

    const rideId = res.json().data.ride.id as string;
    const stored = await app.prisma.ride.findUnique({ where: { id: rideId } });
    expect(stored?.status).toBe("searching");

    await waitFor(async () => (await app.prisma.rideOffer.count({ where: { rideId } })) > 0);
  });

  it("rejects a request without a token", async () => {
    const res = await app.inject({ method: "POST", url: "/rides", payload: VALID_BODY });
    expect(res.statusCode).toBe(401);
  });

  it("returns 422 for an out-of-range coordinate", async () => {
    const { token } = await passengerToken();
    const res = await app.inject({
      method: "POST",
      url: "/rides",
      headers: { authorization: `Bearer ${token}` },
      payload: { ...VALID_BODY, origin: { lat: 200, lng: 0 } },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ status_code: 422, data: { errors: expect.any(Array) } });
  });

  it("refuses a second ride while one is still active", async () => {
    await onlineDriverNearby();
    const { token } = await passengerToken();
    const headers = { authorization: `Bearer ${token}` };

    const rideId = await createRide(token);
    expect(rideId).toBeTruthy();

    const second = await app.inject({
      method: "POST",
      url: "/rides",
      headers,
      payload: VALID_BODY,
    });
    expect(second.statusCode).toBe(409);
  });

  it("lets the passenger read their ride and blocks outsiders", async () => {
    await onlineDriverNearby();
    const { token } = await passengerToken();
    const rideId = await createRide(token);

    const own = await app.inject({
      method: "GET",
      url: `/rides/${rideId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(own.statusCode).toBe(200);
    expect(own.json().data.ride.id).toBe(rideId);

    const outsider = await passengerToken();
    const forbidden = await app.inject({
      method: "GET",
      url: `/rides/${rideId}`,
      headers: { authorization: `Bearer ${outsider.token}` },
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it("returns 404 for an unknown ride id", async () => {
    const { token } = await passengerToken();
    const res = await app.inject({
      method: "GET",
      url: "/rides/00000000-0000-4000-8000-000000000000",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });

  async function settleMatching(rideId: string) {
    await waitFor(async () => {
      const [offers, ride] = await Promise.all([
        app.prisma.rideOffer.count({ where: { rideId } }),
        app.prisma.ride.findUnique({ where: { id: rideId }, select: { status: true } }),
      ]);
      return offers > 0 || ride?.status !== "searching";
    });
  }

  async function createRide(token: string) {
    const created = await app.inject({
      method: "POST",
      url: "/rides",
      headers: { authorization: `Bearer ${token}` },
      payload: VALID_BODY,
    });
    const rideId = created.json().data.ride.id as string;
    await settleMatching(rideId);
    return rideId;
  }

  async function assignRide(rideId: string, driverUserId: string) {
    await waitFor(async () => (await app.prisma.rideOffer.count({ where: { rideId } })) > 0);
    const offer = await app.prisma.rideOffer.findFirstOrThrow({
      where: { rideId },
      orderBy: { offeredAt: "desc" },
    });
    await app.matching.handleAccept(offer.id, driverUserId);
  }

  it("lets the passenger cancel a searching ride", async () => {
    await onlineDriverNearby();
    const { token } = await passengerToken();
    const rideId = await createRide(token);

    const res = await app.inject({
      method: "POST",
      url: `/rides/${rideId}/cancel`,
      headers: { authorization: `Bearer ${token}` },
      payload: { reason: "mudei de ideia" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.ride.status).toBe("cancelled");
    expect(res.json().data.ride.cancellation_reason).toBe("mudei de ideia");
    const stored = await app.prisma.ride.findUnique({ where: { id: rideId } });
    expect(stored?.status).toBe("cancelled");
    expect(stored?.cancelledBy).toBe("passenger");
    expect(stored?.cancelledAt).not.toBeNull();
    expect(stored?.cancelledReason).toBe("mudei de ideia");
  });

  it("lets the assigned driver cancel the ride", async () => {
    const driver = await onlineDriverWithToken();
    const { token } = await passengerToken();
    const rideId = await createRide(token);
    await assignRide(rideId, driver.userId);

    const res = await app.inject({
      method: "POST",
      url: `/rides/${rideId}/cancel`,
      headers: { authorization: `Bearer ${driver.token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.ride.status).toBe("cancelled");
    const stored = await app.prisma.ride.findUnique({ where: { id: rideId } });
    expect(stored?.cancelledBy).toBe("driver");
  });

  it("forbids a driver from cancelling a ride before being assigned", async () => {
    await onlineDriverNearby();
    const otherDriver = await onlineDriverWithToken();
    const { token } = await passengerToken();
    const rideId = await createRide(token);

    const res = await app.inject({
      method: "POST",
      url: `/rides/${rideId}/cancel`,
      headers: { authorization: `Bearer ${otherDriver.token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("blocks an outsider from cancelling", async () => {
    await onlineDriverNearby();
    const { token } = await passengerToken();
    const rideId = await createRide(token);
    const outsider = await passengerToken();

    const res = await app.inject({
      method: "POST",
      url: `/rides/${rideId}/cancel`,
      headers: { authorization: `Bearer ${outsider.token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns 409 when cancelling an already cancelled ride", async () => {
    await onlineDriverNearby();
    const { token } = await passengerToken();
    const rideId = await createRide(token);
    const headers = { authorization: `Bearer ${token}` };

    const first = await app.inject({ method: "POST", url: `/rides/${rideId}/cancel`, headers });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({ method: "POST", url: `/rides/${rideId}/cancel`, headers });
    expect(second.statusCode).toBe(409);
  });

  it("returns 404 when cancelling an unknown ride", async () => {
    const { token } = await passengerToken();
    const res = await app.inject({
      method: "POST",
      url: "/rides/00000000-0000-4000-8000-000000000000/cancel",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it("lists the caller's rides with pagination and a status filter", async () => {
    await onlineDriverNearby();
    const { token } = await passengerToken();
    const rideId = await createRide(token);

    const all = await app.inject({
      method: "GET",
      url: "/rides",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(all.statusCode).toBe(200);
    expect(all.json().data).toMatchObject({ page: 1, page_size: 20, total: 1 });
    expect(all.json().data.items.map((r: { id: string }) => r.id)).toContain(rideId);

    const searching = await app.inject({
      method: "GET",
      url: "/rides?status=searching",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(searching.json().data.total).toBe(1);

    const completed = await app.inject({
      method: "GET",
      url: "/rides?status=completed",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(completed.json().data.total).toBe(0);
  });

  it("takes an assigned ride through arrive, start and complete", async () => {
    const driver = await onlineDriverWithToken();
    const { token } = await passengerToken();
    const rideId = await createRide(token);
    await assignRide(rideId, driver.userId);
    const driverHeaders = { authorization: `Bearer ${driver.token}` };

    const arrive = await app.inject({
      method: "POST",
      url: `/rides/${rideId}/arrive`,
      headers: driverHeaders,
    });
    expect(arrive.statusCode).toBe(200);
    expect(arrive.json().data.ride.arrived_at).not.toBeNull();
    expect(arrive.json().data.ride.status).toBe("assigned");

    const start = await app.inject({
      method: "POST",
      url: `/rides/${rideId}/start`,
      headers: driverHeaders,
    });
    expect(start.statusCode).toBe(200);
    expect(start.json().data.ride.status).toBe("in_progress");

    const durationSpy = vi.spyOn(rideDuration, "observe");
    const complete = await app.inject({
      method: "POST",
      url: `/rides/${rideId}/complete`,
      headers: driverHeaders,
    });
    expect(complete.statusCode).toBe(200);
    expect(complete.json().data.ride.status).toBe("completed");
    expect(durationSpy).toHaveBeenCalledWith(expect.any(Number));
    durationSpy.mockRestore();

    const stored = await app.prisma.ride.findUnique({ where: { id: rideId } });
    expect(stored?.arrivedAt).not.toBeNull();
    expect(stored?.startedAt).not.toBeNull();
    expect(stored?.completedAt).not.toBeNull();
  });

  it("refuses to start a ride before the driver marks arrival", async () => {
    const driver = await onlineDriverWithToken();
    const { token } = await passengerToken();
    const rideId = await createRide(token);
    await assignRide(rideId, driver.userId);

    const res = await app.inject({
      method: "POST",
      url: `/rides/${rideId}/start`,
      headers: { authorization: `Bearer ${driver.token}` },
    });
    expect(res.statusCode).toBe(409);
  });

  it("refuses a second arrival on the same ride", async () => {
    const driver = await onlineDriverWithToken();
    const { token } = await passengerToken();
    const rideId = await createRide(token);
    await assignRide(rideId, driver.userId);
    const headers = { authorization: `Bearer ${driver.token}` };

    const first = await app.inject({ method: "POST", url: `/rides/${rideId}/arrive`, headers });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({ method: "POST", url: `/rides/${rideId}/arrive`, headers });
    expect(second.statusCode).toBe(409);
  });

  it("blocks a driver who isn't assigned from marking arrival", async () => {
    const assignedDriver = await onlineDriverWithToken();
    const outsiderDriver = await onlineDriverWithToken();
    const { token } = await passengerToken();
    const rideId = await createRide(token);
    await assignRide(rideId, assignedDriver.userId);

    const res = await app.inject({
      method: "POST",
      url: `/rides/${rideId}/arrive`,
      headers: { authorization: `Bearer ${outsiderDriver.token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it("refuses to complete a ride that hasn't started", async () => {
    const driver = await onlineDriverWithToken();
    const { token } = await passengerToken();
    const rideId = await createRide(token);
    await assignRide(rideId, driver.userId);

    const res = await app.inject({
      method: "POST",
      url: `/rides/${rideId}/complete`,
      headers: { authorization: `Bearer ${driver.token}` },
    });
    expect(res.statusCode).toBe(409);
  });
});
