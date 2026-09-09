// Cenário de chuva: não dá pra controlar o clima de verdade numa carga
// contra a API real (o multiplicador de clima em pricing-multipliers.ts usa
// o Open-Meteo de verdade), então o que simula é o efeito operacional da
// chuva - menos motorista disponível pra muito mais pedido (5 passageiros
// pra cada motorista, por padrão), o que estressa o motor de matching (fila
// maior, mais timeout/drivers_exhausted) e empurra o sinal de demanda por
// região (URB-35) mais forte que o rush.
//
// Uso:
//   k6 run load-tests/chuva.js
//   k6 run -e DRIVER_VUS=5 -e PASSENGER_VUS=30 -e DURATION=5m load-tests/chuva.js
import { buildScenario } from "./lib/scenario.js";

const scenario = buildScenario({
  name: "chuva",
  driverVusDefault: 5,
  passengerVusDefault: 25,
});

export const options = scenario.options;
export const driverVU = scenario.driverVU;
export const passengerVU = scenario.passengerVU;
