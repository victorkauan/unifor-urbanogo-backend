import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildApp, type AppInstance } from "../../app.js";
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

describe("Auth Routes", () => {
  let app: AppInstance;
  const testEmail = "test@example.com";

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    await prisma.user.deleteMany({ where: { email: testEmail } });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: testEmail } });
    await app.close();
  });

  it("should register a new user", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        name: "Test User",
        email: testEmail,
        password: "password123",
        role: "passenger",
      },
    });

    expect(response.statusCode).toBe(201);
    
    const body = JSON.parse(response.payload);
    expect(body).toHaveProperty("id");
    expect(body.email).toBe(testEmail);
  });

  it("should login the user and return a token", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email: testEmail,
        password: "password123",
      },
    });

    expect(response.statusCode).toBe(200);
    
    const body = JSON.parse(response.payload);
    expect(body).toHaveProperty("token");
  });
});