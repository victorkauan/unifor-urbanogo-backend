import { afterEach, afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type AppInstance } from "../../app.js";
import { resetDatabase } from "../../../test/db.js";

const shouldRun = process.env.RUN_DB_TESTS === "1";

describe.runIf(shouldRun)("driver profile routes", () => {
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

  async function driverToken() {
    const email = `d-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const register = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { name: "Jane Doe", email, password: "password123", role: "driver" },
    });
    return {
      userId: register.json().data.user.id as string,
      token: register.json().data.token as string,
    };
  }

  it("creates, reads and updates the driver profile", async () => {
    const { token, userId } = await driverToken();
    const headers = { authorization: `Bearer ${token}` };

    const missing = await app.inject({ method: "GET", url: "/drivers/me", headers });
    expect(missing.statusCode).toBe(404);

    const created = await app.inject({
      method: "POST",
      url: "/drivers/me",
      headers,
      payload: { service_preference: "rides", vehicle_model: "Onix", vehicle_plate: "ABC1D23" },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().data.driver).toMatchObject({
      user_id: userId,
      service_preference: "rides",
      is_online: false,
      vehicle_model: "Onix",
      vehicle_plate: "ABC1D23",
    });

    const duplicate = await app.inject({
      method: "POST",
      url: "/drivers/me",
      headers,
      payload: { service_preference: "both" },
    });
    expect(duplicate.statusCode).toBe(409);

    const read = await app.inject({ method: "GET", url: "/drivers/me", headers });
    expect(read.statusCode).toBe(200);

    const patched = await app.inject({
      method: "PATCH",
      url: "/drivers/me",
      headers,
      payload: { service_preference: "both" },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json().data.driver.service_preference).toBe("both");
  });

  it("toggles the driver availability", async () => {
    const { token } = await driverToken();
    const headers = { authorization: `Bearer ${token}` };

    await app.inject({
      method: "POST",
      url: "/drivers/me",
      headers,
      payload: { service_preference: "rides" },
    });

    const online = await app.inject({
      method: "PUT",
      url: "/drivers/me/availability",
      headers,
      payload: { is_online: true },
    });
    expect(online.statusCode).toBe(200);
    expect(online.json().data).toMatchObject({ is_online: true });

    const read = await app.inject({ method: "GET", url: "/drivers/me", headers });
    expect(read.json().data.driver.is_online).toBe(true);

    const onlineMembers = await app.redis.smembers("drivers:online");
    expect(onlineMembers).toContain(read.json().data.driver.id);

    const offline = await app.inject({
      method: "PUT",
      url: "/drivers/me/availability",
      headers,
      payload: { is_online: false },
    });
    expect(offline.statusCode).toBe(200);
    expect(offline.json().data).toMatchObject({ is_online: false });
  });

  it("rejects availability changes without a profile", async () => {
    const { token } = await driverToken();
    const res = await app.inject({
      method: "PUT",
      url: "/drivers/me/availability",
      headers: { authorization: `Bearer ${token}` },
      payload: { is_online: true },
    });
    expect(res.statusCode).toBe(404);
  });

  it("requires a token", async () => {
    const res = await app.inject({ method: "GET", url: "/drivers/me" });
    expect(res.statusCode).toBe(401);
  });
});
