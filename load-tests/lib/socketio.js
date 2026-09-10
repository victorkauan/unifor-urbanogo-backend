// Cliente Socket.IO v4 mínimo sobre k6/ws. k6 não roda Node, então não dá
// pra usar o pacote socket.io-client de verdade - isso implementa só o
// suficiente do protocolo (Engine.IO + Socket.IO) pra falar com o nosso
// backend: handshake com auth, emitir evento, receber evento, ping/pong.
//
// Framing (ver docs/adr/0002-rastreamento-tempo-real.md e contrato-api.md
// pra que eventos existem):
//   Engine.IO: "0" open, "2" ping, "3" pong, "4" message (carrega um pacote Socket.IO)
//   Socket.IO (dentro de uma mensagem "4"): "0" connect, "2" event, "4" connect_error

export function connectUrl(wsBaseUrl) {
  return `${wsBaseUrl}/socket.io/?EIO=4&transport=websocket`;
}

export function encodeConnect(auth) {
  return `40${JSON.stringify(auth)}`;
}

export function encodeEvent(event, payload) {
  return `42${JSON.stringify([event, payload])}`;
}

export function parseMessage(raw) {
  if (raw === "2") return { type: "ping" };
  if (raw === "3") return { type: "pong" };
  if (raw.startsWith("0")) return { type: "open", data: safeJson(raw.slice(1)) };
  if (raw.startsWith("40")) return { type: "connected", data: safeJson(raw.slice(2)) };
  if (raw.startsWith("44")) return { type: "connect_error", data: safeJson(raw.slice(2)) };
  if (raw.startsWith("41")) return { type: "disconnect" };
  if (raw.startsWith("42")) {
    const arr = safeJson(raw.slice(2)) ?? [];
    return { type: "event", event: arr[0], payload: arr[1] };
  }
  return { type: "unknown", raw };
}

function safeJson(text) {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
