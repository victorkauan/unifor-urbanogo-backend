import { afterEach, afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type AppInstance } from "../../app.js";
import { resetDatabase } from "../../../test/db.js";

const shouldRun = process.env.RUN_DB_TESTS === "1";

describe.runIf(shouldRun)("rating routes", () => {
  let app: AppInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterEach(async () => {
    await resetDatabase(app.prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  async function signUp(role: "passenger" | "driver") {
    const email = `r-${role}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const register = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { name: role, email, password: "password123", role },
    });
    return {
      userId: register.json().data.user.id as string,
      token: register.json().data.token as string,
    };
  }

  async function completedRide(passengerId: string, driverUserId: string) {
    const driver = await app.prisma.driver.create({
      data: { userId: driverUserId, servicePreference: "both", vehiclePlate: "ABC1D23" },
    });
    return app.prisma.ride.create({
      data: {
        passengerId,
        driverId: driver.id,
        type: "ride",
        status: "completed",
        originLat: 0,
        originLng: 0,
        destLat: 0,
        destLng: 0,
        completedAt: new Date(),
      },
    });
  }

  it("lets a participant rate a completed ride once", async () => {
    const passenger = await signUp("passenger");
    const driver = await signUp("driver");
    const ride = await completedRide(passenger.userId, driver.userId);

    const first = await app.inject({
      method: "POST",
      url: `/rides/${ride.id}/ratings`,
      headers: { authorization: `Bearer ${passenger.token}` },
      payload: { score: 5, comment: "Motorista pontual e educado" },
    });
    expect(first.statusCode).toBe(201);
    expect(first.json().data.rating).toMatchObject({
      ride_id: ride.id,
      ratee_id: driver.userId,
      score: 5,
    });

    const duplicate = await app.inject({
      method: "POST",
      url: `/rides/${ride.id}/ratings`,
      headers: { authorization: `Bearer ${passenger.token}` },
      payload: { score: 4 },
    });
    expect(duplicate.statusCode).toBe(409);
  });

  it("rejects rating a ride that is not completed", async () => {
    const passenger = await signUp("passenger");
    const driver = await signUp("driver");
    const ride = await completedRide(passenger.userId, driver.userId);
    await app.prisma.ride.update({ where: { id: ride.id }, data: { status: "in_progress" } });

    const res = await app.inject({
      method: "POST",
      url: `/rides/${ride.id}/ratings`,
      headers: { authorization: `Bearer ${passenger.token}` },
      payload: { score: 5 },
    });
    expect(res.statusCode).toBe(409);
  });

  it("rejects a rater who is not part of the ride", async () => {
    const passenger = await signUp("passenger");
    const driver = await signUp("driver");
    const outsider = await signUp("passenger");
    const ride = await completedRide(passenger.userId, driver.userId);

    const res = await app.inject({
      method: "POST",
      url: `/rides/${ride.id}/ratings`,
      headers: { authorization: `Bearer ${outsider.token}` },
      payload: { score: 1 },
    });
    expect(res.statusCode).toBe(403);
  });

  it("lists a user's ratings with pagination", async () => {
    const passenger = await signUp("passenger");
    const driver = await signUp("driver");
    const ride = await completedRide(passenger.userId, driver.userId);
    await app.inject({
      method: "POST",
      url: `/rides/${ride.id}/ratings`,
      headers: { authorization: `Bearer ${passenger.token}` },
      payload: { score: 5 },
    });

    const list = await app.inject({
      method: "GET",
      url: `/users/${driver.userId}/ratings`,
      headers: { authorization: `Bearer ${driver.token}` },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().data).toMatchObject({ page: 1, page_size: 20, total: 1 });
    expect(list.json().data.items[0]).toMatchObject({ ratee_id: driver.userId, score: 5 });
  });
});
