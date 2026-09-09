import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type AppInstance } from "./app.js";

let app: AppInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("GET /health", () => {
  it("returns 200 with the standard envelope", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ status_code: 200, message: expect.any(String) });
    expect(body.data).toHaveProperty("uptime_seconds");
  });
});

describe("unknown route", () => {
  it("returns 404 with the standard envelope", async () => {
    const res = await app.inject({ method: "GET", url: "/does-not-exist" });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ status_code: 404, data: null });
  });
});

describe("x-request-id correlation", () => {
  it("generates a request id and echoes it back as a response header", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.headers["x-request-id"]).toEqual(expect.any(String));
    expect((res.headers["x-request-id"] as string).length).toBeGreaterThan(0);
  });

  it("reuses a client-provided x-request-id instead of generating a new one", async () => {
    const requestId = "11111111-1111-1111-1111-111111111111";
    const res = await app.inject({
      method: "GET",
      url: "/health",
      headers: { "x-request-id": requestId },
    });

    expect(res.headers["x-request-id"]).toBe(requestId);
  });
});
