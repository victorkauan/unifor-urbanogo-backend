import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type AppInstance } from "../app.js";

describe("GET /metrics", () => {
  let app: AppInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns the Prometheus exposition format, not the JSON envelope", async () => {
    await app.inject({ method: "GET", url: "/health" });

    const res = await app.inject({ method: "GET", url: "/metrics" });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.body).toContain("http_requests_total");
    expect(res.body).toMatch(
      /http_requests_total\{method="GET",route="\/health",status_code="200"\} \d+/,
    );
  });
});
