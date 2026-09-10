import { Counter, Trend } from "k6/metrics";
import { driverIteration, passengerIteration } from "./flows.js";
import { getOrCreateDriver, getOrCreatePassenger } from "./setup.js";

const CENTER = {
  lat: Number(__ENV.CENTER_LAT || -3.7319),
  lng: Number(__ENV.CENTER_LNG || -38.5267),
};

const DRIVER_WINDOW_MS = 30_000;
const PASSENGER_MAX_WAIT_MS = 70_000; // > timeout global de busca do matching (60s, ADR 0001) + folga

/**
 * Monta um cenário k6 completo (options + setup + VUs de motorista e
 * passageiro) parametrizável por env var. `driverVusDefault`/
 * `passengerVusDefault` são só o ponto de partida de cada script
 * (rush.js/chuva.js) - a proporção entre os dois é o que diferencia os
 * cenários de pico (rush: oferta de motoristas equilibrada; chuva: poucos
 * motoristas pra muito pedido, simulando gente evitando dirigir na chuva).
 */
export function buildScenario({ name, driverVusDefault, passengerVusDefault }) {
  const baseUrl = __ENV.BASE_URL || "http://localhost:3000";
  const wsUrl = __ENV.WS_URL || baseUrl.replace(/^http/, "ws");
  const duration = __ENV.DURATION || "2m";
  const driverVus = Number(__ENV.DRIVER_VUS || driverVusDefault);
  const passengerVus = Number(__ENV.PASSENGER_VUS || passengerVusDefault);
  const reconcileIntervalMs = Number(__ENV.RECONCILE_INTERVAL_MS || 1_000);
  const thinkTimeS = {
    min: Number(__ENV.PASSENGER_THINK_MIN_S || 3),
    max: Number(__ENV.PASSENGER_THINK_MAX_S || 8),
  };

  const matchingLatency = new Trend(`${name}_matching_latency_ms`);
  const rideOutcomes = new Counter(`${name}_ride_outcomes`);

  const options = {
    scenarios: {
      [`${name}_drivers`]: {
        executor: "constant-vus",
        exec: "driverVU",
        vus: driverVus,
        duration,
      },
      [`${name}_passengers`]: {
        executor: "constant-vus",
        exec: "passengerVU",
        vus: passengerVus,
        duration,
        // dá tempo dos motoristas conectarem e mandarem a 1a posição antes
        // do primeiro pedido de corrida chegar.
        startTime: "5s",
      },
    },
  };

  function driverVU() {
    const driver = getOrCreateDriver(baseUrl);
    driverIteration(baseUrl, wsUrl, driver, CENTER, DRIVER_WINDOW_MS);
  }

  function passengerVU() {
    const passenger = getOrCreatePassenger(baseUrl);
    passengerIteration(
      baseUrl,
      wsUrl,
      passenger,
      CENTER,
      matchingLatency,
      rideOutcomes,
      PASSENGER_MAX_WAIT_MS,
      thinkTimeS,
      reconcileIntervalMs,
    );
  }

  return { options, driverVU, passengerVU };
}
