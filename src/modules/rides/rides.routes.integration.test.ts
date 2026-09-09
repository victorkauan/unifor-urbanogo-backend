import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type AppInstance } from "../../app.js";
import { resetDatabase } from "../../../test/db.js";
import { createTestUser } from "../../../test/fixtures.js";

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
    await resetDatabase(app.prisma);
    await app.redis.flushall();
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
    return { email, token: login.json().token as string };
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

    const first = await app.inject({ method: "POST", url: "/rides", headers, payload: VALID_BODY });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: "POST",
      url: "/rides",
      headers,
      payload: VALID_BODY,
    });
    expect(second.statusCode).toBe(409);
  });

  it("lets the passenger read their ride and blocks outsiders", async () => {
    const { token } = await passengerToken();
    const created = await app.inject({
      method: "POST",
      url: "/rides",
      headers: { authorization: `Bearer ${token}` },
      payload: VALID_BODY,
    });
    const rideId = created.json().data.ride.id as string;

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
});
