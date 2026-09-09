import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type AppInstance } from "../../app.js";
import { verifyToken } from "../../lib/jwt.js";
import { resetDatabase } from "../../../test/db.js";

const shouldRun = process.env.RUN_DB_TESTS === "1";

describe.runIf(shouldRun)(
  "login token is consumable by verifyJwt and by the socket verifier",
  () => {
    let app: AppInstance;

    beforeAll(async () => {
      app = await buildApp();
      await app.ready();
    });

    afterAll(async () => {
      await resetDatabase(app.prisma);
      await app.close();
    });

    it("issues a token whose sub claim is the user id and passes verifyJwt", async () => {
      const email = `token-${Date.now()}@example.com`;
      const register = await app.inject({
        method: "POST",
        url: "/auth/register",
        payload: { name: "Token User", email, password: "password123", role: "driver" },
      });
      const userId = register.json().data.user.id as string;
      expect(register.statusCode).toBe(201);

      const login = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email, password: "password123" },
      });
      const token = login.json().data.token as string;

      expect(verifyToken(token)).toEqual({ sub: userId });

      const withToken = await app.inject({
        method: "POST",
        url: `/offers/${randomUUID()}/reject`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(withToken.statusCode).toBe(404);

      const withoutToken = await app.inject({
        method: "POST",
        url: `/offers/${randomUUID()}/reject`,
      });
      expect(withoutToken.statusCode).toBe(401);
    });
  },
);
