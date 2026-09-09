import { afterEach, afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type AppInstance } from "../../app.js";
import { resetDatabase } from "../../../test/db.js";

const shouldRun = process.env.RUN_DB_TESTS === "1";

describe.runIf(shouldRun)("user profile routes", () => {
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

  async function signUp(role: "passenger" | "driver" = "passenger") {
    const email = `u-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const register = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { name: "John Doe", email, password: "password123", role },
    });
    return {
      email,
      userId: register.json().data.user.id as string,
      token: register.json().data.token as string,
    };
  }

  it("reads, updates and soft-deletes the current user", async () => {
    const { token, userId } = await signUp();
    const headers = { authorization: `Bearer ${token}` };

    const read = await app.inject({ method: "GET", url: "/users/me", headers });
    expect(read.statusCode).toBe(200);
    expect(read.json().data.user.id).toBe(userId);

    const patch = await app.inject({
      method: "PATCH",
      url: "/users/me",
      headers,
      payload: { name: "Jane Doe", phone: "+5585988887777" },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().data.user).toMatchObject({ name: "Jane Doe", phone: "+5585988887777" });

    const remove = await app.inject({ method: "DELETE", url: "/users/me", headers });
    expect(remove.statusCode).toBe(200);
    expect(remove.json().data).toBeNull();

    const afterDelete = await app.inject({ method: "GET", url: "/users/me", headers });
    expect(afterDelete.statusCode).toBe(401);
  });

  it("requires a token", async () => {
    const res = await app.inject({ method: "GET", url: "/users/me" });
    expect(res.statusCode).toBe(401);
  });

  it("returns an empty paginated rating list and a default trust score", async () => {
    const { token, userId } = await signUp();
    const headers = { authorization: `Bearer ${token}` };

    const ratings = await app.inject({ method: "GET", url: `/users/${userId}/ratings`, headers });
    expect(ratings.statusCode).toBe(200);
    expect(ratings.json().data).toMatchObject({ items: [], page: 1, page_size: 20, total: 0 });

    const trust = await app.inject({ method: "GET", url: `/users/${userId}/trust-score`, headers });
    expect(trust.statusCode).toBe(200);
    expect(trust.json().data.trust_score).toMatchObject({
      user_id: userId,
      score: 1,
      source: "stub",
    });
  });
});
