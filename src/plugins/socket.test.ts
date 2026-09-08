import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import { buildApp, type AppInstance } from "../app.js";
import { signToken } from "../lib/jwt.js";
import {
  DRIVER_LOCATION_TTL_SECONDS,
  driverLocationKey,
} from "../modules/realtime/driver-location.repo.js";
import { rideRoom } from "../modules/realtime/realtime.gateway.js";

let app: AppInstance;
let address: string;

beforeAll(async () => {
  app = await buildApp();
  address = await app.listen({ port: 0, host: "127.0.0.1" });
});

afterAll(async () => {
  await app.close();
});

function connect(token?: string): ClientSocket {
  return ioClient(address, {
    auth: token ? { token } : {},
    reconnection: false,
    forceNew: true,
  });
}

function waitFor<T = unknown>(socket: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, resolve));
}

function joinRide(socket: ClientSocket, rideId: string): Promise<{ ok: boolean }> {
  return new Promise((resolve) => socket.emit("ride:join", { ride_id: rideId }, resolve));
}

describe("socket handshake", () => {
  it("rejects a connection without a token", async () => {
    const client = connect();
    const err = await waitFor<Error>(client, "connect_error");
    expect(err.message).toBe("unauthorized");
    client.close();
  });

  it("rejects a connection with an invalid token", async () => {
    const client = connect("token-invalido");
    const err = await waitFor<Error>(client, "connect_error");
    expect(err.message).toBe("unauthorized");
    client.close();
  });

  it("accepts a connection with a valid token", async () => {
    const token = signToken({ sub: randomUUID() });
    const client = connect(token);
    await waitFor(client, "connect");
    expect(client.connected).toBe(true);
    client.close();
  });
});

describe("ride room join/leave", () => {
  it("delivers a room broadcast to two clients that joined the same ride", async () => {
    const rideId = randomUUID();
    const passenger = connect(signToken({ sub: randomUUID() }));
    const driver = connect(signToken({ sub: randomUUID() }));

    await Promise.all([waitFor(passenger, "connect"), waitFor(driver, "connect")]);
    await Promise.all([joinRide(passenger, rideId), joinRide(driver, rideId)]);

    const statusPayload = { ride_id: rideId, status: "assigned" };
    const [passengerMsg, driverMsg] = await Promise.all([
      waitFor(passenger, "ride:status"),
      waitFor(driver, "ride:status"),
      Promise.resolve(app.io.to(rideRoom(rideId)).emit("ride:status", statusPayload)),
    ]);

    expect(passengerMsg).toEqual(statusPayload);
    expect(driverMsg).toEqual(statusPayload);

    passenger.close();
    driver.close();
  });

  it("emits an error event when the join payload is invalid", async () => {
    const client = connect(signToken({ sub: randomUUID() }));
    await waitFor(client, "connect");

    client.emit("ride:join", { ride_id: "not-a-uuid" });
    const err = await waitFor<{ code: string; message: string }>(client, "error");

    expect(err.code).toBe("invalid_payload");
    client.close();
  });
});

describe("driver:location ingestion", () => {
  it("stores the driver's last known position in Redis with a TTL", async () => {
    const userId = randomUUID();
    const setSpy = vi.spyOn(app.redis, "set").mockResolvedValue("OK");
    const findFirstSpy = vi.spyOn(app.prisma.ride, "findFirst").mockResolvedValue(null);
    const client = connect(signToken({ sub: userId }));
    await waitFor(client, "connect");

    client.emit("driver:location", {
      lat: -3.73,
      lng: -38.52,
      heading: 90,
      speed: 10,
      recorded_at: new Date().toISOString(),
    });

    await vi.waitFor(() =>
      expect(setSpy).toHaveBeenCalledWith(
        driverLocationKey(userId),
        expect.any(String),
        "EX",
        DRIVER_LOCATION_TTL_SECONDS,
      ),
    );

    setSpy.mockRestore();
    findFirstSpy.mockRestore();
    client.close();
  });

  it("emits an error event for an invalid location payload", async () => {
    const findFirstSpy = vi.spyOn(app.prisma.ride, "findFirst").mockResolvedValue(null);
    const client = connect(signToken({ sub: randomUUID() }));
    await waitFor(client, "connect");

    client.emit("driver:location", { lat: 200, lng: -38.52, recorded_at: "not-a-date" });
    const err = await waitFor<{ code: string; message: string }>(client, "error");

    expect(err.code).toBe("invalid_payload");
    findFirstSpy.mockRestore();
    client.close();
  });
});

describe("server-side position broadcast (RT-4)", () => {
  it("consolidates a real driver:location ping and broadcasts it to the ride room", async () => {
    const rideId = randomUUID();
    const driverUserId = randomUUID();

    const redisSetSpy = vi.spyOn(app.redis, "set").mockResolvedValue("OK");
    const findFirstSpy = vi
      .spyOn(app.prisma.ride, "findFirst")
      .mockResolvedValue({ id: rideId } as never);

    const passenger = connect(signToken({ sub: randomUUID() }));
    const driver = connect(signToken({ sub: driverUserId }));
    await Promise.all([waitFor(passenger, "connect"), waitFor(driver, "connect")]);
    await joinRide(passenger, rideId);

    driver.emit("driver:location", {
      lat: -3.73,
      lng: -38.52,
      heading: 90,
      speed: 10,
      recorded_at: new Date().toISOString(),
    });

    const msg = await waitFor<{ ride_id: string; predicted: boolean }>(
      passenger,
      "ride:driver_location",
    );

    expect(msg.ride_id).toBe(rideId);
    expect(msg.predicted).toBe(false);

    redisSetSpy.mockRestore();
    findFirstSpy.mockRestore();
    passenger.close();
    driver.close();
  });

  it("does not broadcast when the driver has no active ride", async () => {
    const driverUserId = randomUUID();

    const redisSetSpy = vi.spyOn(app.redis, "set").mockResolvedValue("OK");
    const findFirstSpy = vi.spyOn(app.prisma.ride, "findFirst").mockResolvedValue(null);

    const driver = connect(signToken({ sub: driverUserId }));
    await waitFor(driver, "connect");

    let received = false;
    driver.on("ride:driver_location", () => {
      received = true;
    });

    driver.emit("driver:location", {
      lat: -3.73,
      lng: -38.52,
      recorded_at: new Date().toISOString(),
    });

    // asserção negativa: sem ack para "nada aconteceu", uma folga generosa é o correto aqui
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(received).toBe(false);

    redisSetSpy.mockRestore();
    findFirstSpy.mockRestore();
    driver.close();
  });
});

describe("log correlation", () => {
  it("binds connectionId/userId to the socket logger and rideId to ride:join logs", async () => {
    const childSpy = vi.spyOn(app.log, "child");
    const userId = randomUUID();
    const client = connect(signToken({ sub: userId }));
    await waitFor(client, "connect");

    expect(childSpy).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: expect.any(String), userId }),
    );
    const socketLog = childSpy.mock.results[0]?.value as { child: (...args: unknown[]) => unknown };
    const rideLogSpy = vi.spyOn(socketLog, "child");

    const rideId = randomUUID();
    await joinRide(client, rideId);

    expect(rideLogSpy).toHaveBeenCalledWith({ rideId });

    rideLogSpy.mockRestore();
    childSpy.mockRestore();
    client.close();
  });
});
