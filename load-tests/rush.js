// Cenário de pico normal: bastante gente pedindo corrida, oferta de
// motoristas equilibrada (2 passageiros pra cada motorista, por padrão).
//
// Uso:
//   k6 run load-tests/rush.js
//   k6 run -e DRIVER_VUS=20 -e PASSENGER_VUS=40 -e DURATION=5m load-tests/rush.js
import { buildScenario } from "./lib/scenario.js";

const scenario = buildScenario({
  name: "rush",
  driverVusDefault: 10,
  passengerVusDefault: 20,
});

export const options = scenario.options;
export const driverVU = scenario.driverVU;
export const passengerVU = scenario.passengerVU;
