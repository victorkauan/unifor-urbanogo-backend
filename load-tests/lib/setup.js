import { createDriverProfile, registerAndLogin, setDriverAvailability } from "./api.js";

/**
 * Cada VU é UM motorista/passageiro simulado que existe do início ao fim do
 * teste: a conta é criada uma única vez, na primeira iteração daquele VU, e
 * fica guardada numa variável de módulo - cada VU do k6 roda sua própria
 * cópia isolada do script, então isso não precisa de nenhuma coordenação
 * entre VUs.
 *
 * Por que não um pool pré-criado em setup() indexado por `__VU`: o k6 não
 * garante que os IDs de VU de um cenário formem uma faixa contígua quando há
 * mais de um cenário no mesmo teste - na prática, os IDs de "rush_drivers" e
 * "rush_passengers" ficam entrelaçados (ex.: motoristas caindo em 1, 4, 7).
 * Qualquer hash fixo de `__VU` módulo o tamanho do pool colide sempre que o
 * conjunto de IDs recebido não for um sistema completo de resíduos - o que
 * aconteceu de verdade aqui: os 3 IDs de motorista caíram todos no mesmo
 * resto, e os 3 VUs viraram o MESMO motorista ao mesmo tempo (a mesma conta
 * com 3 sockets concorrentes), esvaziando o pool de motoristas de verdade
 * disponíveis pro matching sem que nenhum check() acusasse nada.
 */
let driver = null;
let passenger = null;

export function getOrCreateDriver(baseUrl) {
  if (!driver) {
    const email = `k6-driver-${Date.now()}-${Math.floor(Math.random() * 1e6)}-${__VU}@example.com`;
    const { userId, token } = registerAndLogin(baseUrl, {
      name: `K6 Driver ${__VU}`,
      email,
      password: "password123",
      role: "driver",
    });
    const profile = createDriverProfile(baseUrl, token);
    setDriverAvailability(baseUrl, token, true);
    driver = { userId, token, driverId: profile?.id };
  }
  return driver;
}

export function getOrCreatePassenger(baseUrl) {
  if (!passenger) {
    const email = `k6-passenger-${Date.now()}-${Math.floor(Math.random() * 1e6)}-${__VU}@example.com`;
    const { userId, token } = registerAndLogin(baseUrl, {
      name: `K6 Passenger ${__VU}`,
      email,
      password: "password123",
      role: "passenger",
    });
    passenger = { userId, token };
  }
  return passenger;
}
