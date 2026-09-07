import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import { buildApp, type AppInstance } from "../app.js";
import { signToken } from "../lib/jwt.js";
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

    passenger.emit("ride:join", { ride_id: rideId });
    driver.emit("ride:join", { ride_id: rideId });

    // dá tempo do join ser processado no servidor antes do broadcast
    await new Promise((resolve) => setTimeout(resolve, 50));

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
