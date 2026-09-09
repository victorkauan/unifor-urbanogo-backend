import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type AppInstance } from "../../app.js";
import { resetDatabase } from "../../../test/db.js";

const shouldRun = process.env.RUN_DB_TESTS === "1";

const VALID_BODY = {
  type: "ride" as const,
  origin: { lat: -3.7319, lng: -38.5267, address: "Rua das Flores, 100" },
  destination: { lat: -3.75, lng: -38.49 },
};

describe.runIf(shouldRun)("quote route", () => {
  let app: AppInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await resetDatabase(app.prisma);
    await app.close();
  });

  async function passengerToken() {
    const email = `quote-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
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
    return login.json().token as string;
  }

  it("returns an estimated price with the full breakdown", async () => {
    const token = await passengerToken();
    const res = await app.inject({
      method: "POST",
      url: "/quotes",
      headers: { authorization: `Bearer ${token}` },
      payload: VALID_BODY,
    });

    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.distance_meters).toBeGreaterThan(0);
    expect(data.price_cents).toBeGreaterThan(0);
    expect(data.currency).toBe("BRL");
    expect(data.price_breakdown).toMatchObject({
      base_cents: expect.any(Number),
      per_km_cents: expect.any(Number),
      service_fee_cents: expect.any(Number),
      multipliers: {
        time: expect.any(Number),
        demand: expect.any(Number),
        weather: expect.any(Number),
      },
    });
    expect(new Date(data.expires_at).getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects a request without a token", async () => {
    const res = await app.inject({ method: "POST", url: "/quotes", payload: VALID_BODY });
    expect(res.statusCode).toBe(401);
  });

  it("returns 422 for an out-of-range coordinate", async () => {
    const token = await passengerToken();
    const res = await app.inject({
      method: "POST",
      url: "/quotes",
      headers: { authorization: `Bearer ${token}` },
      payload: { ...VALID_BODY, destination: { lat: 0, lng: 999 } },
    });
    expect(res.statusCode).toBe(422);
  });
});
