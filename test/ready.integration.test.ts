import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type AppInstance } from "../src/app.js";
import { resetDatabase } from "./db.js";
import { createTestDriver } from "./fixtures.js";

const shouldRun = process.env.RUN_DB_TESTS === "1";

/**
 * Exemplo de teste de integração (TST-1): roda contra Postgres e Redis de
 * verdade, não mocks. RUN_DB_TESTS=1 é fornecido pelo CI (services: do
 * workflow, URB-19) ou pelo globalSetup local via Testcontainers.
 */
describe.runIf(shouldRun)("integration: /ready + fixtures against a real database", () => {
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

  it("reports ready when Postgres and Redis are reachable", async () => {
    const res = await app.inject({ method: "GET", url: "/ready" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status_code: 200,
      data: { postgres: "ok", redis: "ok" },
    });
  });

  it("persists a driver fixture in the real database", async () => {
    const driver = await createTestDriver(app.prisma);

    const found = await app.prisma.driver.findUnique({ where: { id: driver.id } });
    expect(found).not.toBeNull();
    expect(found?.servicePreference).toBe("both");
  });
});
