import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type AppInstance } from "../../app.js";
import { resetDatabase } from "../../../test/db.js";

const shouldRun = process.env.RUN_DB_TESTS === "1";

describe.runIf(shouldRun)("auth routes", () => {
  let app: AppInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await resetDatabase(app.prisma);
    await app.close();
  });

  function credentials() {
    return {
      name: "John Doe",
      email: `john-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      password: "password123",
      phone: "+5585999990000",
      role: "passenger" as const,
    };
  }

  it("registers a user and returns the user and a token in the envelope", async () => {
    const body = credentials();
    const res = await app.inject({ method: "POST", url: "/auth/register", payload: body });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      status_code: 201,
      data: {
        user: { name: "John Doe", email: body.email, phone: body.phone, role: "passenger" },
        token: expect.any(String),
      },
    });
  });

  it("rejects a duplicate email", async () => {
    const body = credentials();
    await app.inject({ method: "POST", url: "/auth/register", payload: body });
    const again = await app.inject({ method: "POST", url: "/auth/register", payload: body });
    expect(again.statusCode).toBe(409);
  });

  it("logs in and returns the user and a token", async () => {
    const body = credentials();
    await app.inject({ method: "POST", url: "/auth/register", payload: body });

    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: body.email, password: body.password },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.user.email).toBe(body.email);
    expect(res.json().data.token).toEqual(expect.any(String));
  });

  it("rejects a login with a wrong password", async () => {
    const body = credentials();
    await app.inject({ method: "POST", url: "/auth/register", payload: body });
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: body.email, password: "wrong-password" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns the current user on GET /auth/me and 401 without a token", async () => {
    const body = credentials();
    const register = await app.inject({ method: "POST", url: "/auth/register", payload: body });
    const token = register.json().data.token as string;

    const me = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().data.user.email).toBe(body.email);

    const anon = await app.inject({ method: "GET", url: "/auth/me" });
    expect(anon.statusCode).toBe(401);
  });
});
