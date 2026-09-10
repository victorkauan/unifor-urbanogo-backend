import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AppInstance } from "../app.js";

let app: AppInstance;

beforeAll(async () => {
  process.env.RATE_LIMIT_MAX = "3";
  process.env.CORS_ORIGINS = "https://app.urbanogo.test";
  const { buildApp } = await import("../app.js");
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe("security headers (helmet)", () => {
  it("sets hardening headers on responses", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });

    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBeDefined();
    expect(res.headers["x-dns-prefetch-control"]).toBeDefined();
  });
});

describe("CORS", () => {
  it("reflects an allowed origin", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "https://app.urbanogo.test" },
    });

    expect(res.headers["access-control-allow-origin"]).toBe("https://app.urbanogo.test");
  });

  it("does not allow an unlisted origin", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "https://evil.test" },
    });

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("rate limiting", () => {
  it("returns 429 in the standard envelope once the window budget is spent", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      const res = await app.inject({ method: "GET", url: "/rides/not-a-uuid" });
      statuses.push(res.statusCode);
      if (res.statusCode === 429) {
        expect(res.json()).toMatchObject({ status_code: 429, data: null });
        expect(res.headers["retry-after"]).toBeDefined();
      }
    }

    expect(statuses).toContain(429);
  });

  it("does not rate limit health and readiness probes", async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, () => app.inject({ method: "GET", url: "/health" })),
    );

    expect(results.every((res) => res.statusCode === 200)).toBe(true);
  });
});
