import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp, type AppInstance } from "../../app.js";

describe("GET /ready", () => {
  let app: AppInstance;

  afterEach(async () => {
    await app?.close();
  });

  it("returns 200 when Postgres and Redis are reachable", async () => {
    app = await buildApp();
    await app.ready();
    vi.spyOn(app.prisma, "$queryRaw").mockResolvedValue([{ "?column?": 1 }] as never);
    vi.spyOn(app.redis, "ping").mockResolvedValue("PONG");

    const res = await app.inject({ method: "GET", url: "/ready" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status_code: 200,
      data: { postgres: "ok", redis: "ok" },
    });
  });

  it("returns 503 when Postgres is unreachable", async () => {
    app = await buildApp();
    await app.ready();
    vi.spyOn(app.prisma, "$queryRaw").mockRejectedValue(new Error("connection refused"));
    vi.spyOn(app.redis, "ping").mockResolvedValue("PONG");

    const res = await app.inject({ method: "GET", url: "/ready" });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({
      status_code: 503,
      data: { postgres: "error", redis: "ok" },
    });
  });

  it("returns 503 when Redis is unreachable", async () => {
    app = await buildApp();
    await app.ready();
    vi.spyOn(app.prisma, "$queryRaw").mockResolvedValue([{ "?column?": 1 }] as never);
    vi.spyOn(app.redis, "ping").mockRejectedValue(new Error("connection refused"));

    const res = await app.inject({ method: "GET", url: "/ready" });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({
      status_code: 503,
      data: { postgres: "ok", redis: "error" },
    });
  });
});
