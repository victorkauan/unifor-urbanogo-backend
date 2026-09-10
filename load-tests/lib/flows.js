import ws from "k6/ws";
import { check, sleep } from "k6";
import {
  acceptOffer,
  arriveRide,
  cancelRide,
  completeRide,
  createRide,
  getRide,
  startRide,
} from "./api.js";
import { jitter } from "./geo.js";
import { connectUrl, encodeConnect, encodeEvent, parseMessage } from "./socketio.js";

/**
 * Um motorista: conecta no socket, manda driver:location a cada 5s (ADR
 * 0002) por até `windowMs`, e se receber uma oferta, aceita e passa pelo
 * ciclo de vida (arrive/start/complete) pra liberar de novo pra próxima
 * oferta - sem isso o motorista fica "ocupado" pro resto do teste
 * (dropBusyDrivers no motor de matching) e o pool efetivo de motoristas
 * encolhe com o tempo.
 */
export function driverIteration(baseUrl, wsUrl, driver, center, windowMs) {
  const res = ws.connect(connectUrl(wsUrl), {}, function (socket) {
    socket.on("open", () => {
      socket.send(encodeConnect({ token: driver.token }));

      socket.setInterval(() => {
        const point = jitter(center);
        socket.send(
          encodeEvent("driver:location", {
            lat: point.lat,
            lng: point.lng,
            heading: Math.floor(Math.random() * 360),
            speed: 8 + Math.random() * 6,
            recorded_at: new Date().toISOString(),
          }),
        );
      }, 5_000);

      socket.setTimeout(() => socket.close(), windowMs);
    });

    socket.on("message", (raw) => {
      const msg = parseMessage(raw);
      if (msg.type === "ping") {
        socket.send("3");
        return;
      }
      if (msg.type !== "event" || msg.event !== "matching:offer") {
        return;
      }

      const { offer_id: offerId, ride_id: rideId } = msg.payload;
      const accept = acceptOffer(baseUrl, driver.token, offerId);
      // sob concorrência (poucos motoristas, muita busca simultânea), mais de
      // uma corrida pode ofertar pro mesmo motorista quase ao mesmo tempo; só
      // uma aceita, as outras recebem 409 (oferta não mais pendente) - isso é
      // esperado, não indica falha no script.
      check(accept, { "offer accept: 200 or 409": (r) => r.status === 200 || r.status === 409 });
      if (accept.status !== 200) {
        return;
      }

      socket.setTimeout(() => arriveRide(baseUrl, driver.token, rideId), 500);
      socket.setTimeout(() => startRide(baseUrl, driver.token, rideId), 1_500);
      socket.setTimeout(() => completeRide(baseUrl, driver.token, rideId), 3_000);
      socket.setTimeout(() => socket.close(), 3_500);
    });
  });

  check(res, { "driver ws handshake: 101": (r) => r && r.status === 101 });
}

/**
 * Um passageiro: pede uma corrida, entra na sala (carga real de socket,
 * como um app com conexão persistente) e mede o tempo até "assigned" (a
 * mesma definição de SLA do matching em docs/visao-geral.md: ponta a ponta,
 * do pedido até o motorista atribuído).
 *
 * A medição usa `assigned_at` de GET /rides/:id (timestamp do servidor), não
 * o instante em que o evento `ride:status` chega no socket: com poucos
 * motoristas e busca rápida, o matching pode concluir em poucos ms - mais
 * rápido que o round-trip de handshake do WS + `ride:join`, então o
 * passageiro entra na sala DEPOIS que o "assigned" já foi emitido e nunca
 * recebe esse evento (sem replay/catch-up no server). Um app real reconcilia
 * isso consultando o REST; o script faz o mesmo via polling, o que também
 * evita divergência de relógio entre client e server.
 *
 * Tem uma pausa (`sleep`) no fim de cada iteração: um passageiro de
 * verdade, depois de pedir uma corrida (com ou sem motorista disponível),
 * não sai pedindo outra na sequência sem intervalo - sem essa pausa, poucos
 * VUs conseguem gerar uma taxa de pedidos artificialmente muito maior do
 * que o cenário pretende (ex.: "2 passageiros por motorista" deixa de
 * significar algo se cada VU vira um loop apertado de retry).
 */
function passengerThinkTime(thinkTimeS) {
  sleep(thinkTimeS.min + Math.random() * (thinkTimeS.max - thinkTimeS.min));
}

export function passengerIteration(
  baseUrl,
  wsUrl,
  passenger,
  center,
  matchingLatency,
  rideOutcomes,
  maxWaitMs,
  thinkTimeS = { min: 3, max: 8 },
  reconcileIntervalMs = 1_000,
) {
  const origin = jitter(center);
  const destination = jitter(center, 3);

  const createRes = createRide(baseUrl, passenger.token, { type: "ride", origin, destination });
  check(createRes, { "create ride: 201 or 409": (r) => r.status === 201 || r.status === 409 });
  if (createRes.status !== 201) {
    passengerThinkTime(thinkTimeS);
    return;
  }

  const ride = createRes.json()?.data?.ride;
  const rideId = ride?.id;
  const requestedAt = new Date(ride.requested_at).getTime();
  let latencyRecorded = false;
  let terminalStatus = null;

  function reconcile() {
    if (terminalStatus) {
      return;
    }
    const res = getRide(baseUrl, passenger.token, rideId);
    const current = res.status === 200 ? res.json()?.data?.ride : null;
    if (!current) {
      return;
    }
    if (!latencyRecorded && current.assigned_at) {
      matchingLatency.add(new Date(current.assigned_at).getTime() - requestedAt);
      latencyRecorded = true;
    }
    if (["completed", "cancelled", "expired"].includes(current.status)) {
      terminalStatus = current.status;
    }
  }

  const res = ws.connect(connectUrl(wsUrl), {}, function (socket) {
    socket.on("open", () => {
      socket.send(encodeConnect({ token: passenger.token }));
      socket.send(encodeEvent("ride:join", { ride_id: rideId }));
      socket.setInterval(reconcile, reconcileIntervalMs);
      socket.setTimeout(() => socket.close(), maxWaitMs);
    });

    socket.on("message", (raw) => {
      const msg = parseMessage(raw);
      if (msg.type === "ping") {
        socket.send("3");
        return;
      }
      if (msg.type !== "event" || msg.event !== "ride:status") {
        return;
      }
      if (["completed", "cancelled", "expired"].includes(msg.payload.status)) {
        terminalStatus = msg.payload.status;
        socket.close();
      }
    });
  });

  check(res, { "passenger ws handshake: 101": (r) => r && r.status === 101 });

  if (!latencyRecorded || !terminalStatus) {
    reconcile();
  }

  if (terminalStatus) {
    rideOutcomes.add(1, { outcome: terminalStatus });
    passengerThinkTime(thinkTimeS);
    return;
  }

  cancelRide(baseUrl, passenger.token, rideId, "load-test: sem desfecho na janela de espera");
  rideOutcomes.add(1, { outcome: "timed_out" });
  passengerThinkTime(thinkTimeS);
}
