import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from "prom-client";

export const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const httpRequestsTotal = new Counter({
  name: "http_requests_total",
  help: "Total de requisições HTTP concluídas",
  labelNames: ["method", "route", "status_code"] as const,
  registers: [registry],
});

/**
 * Duração de uma busca de matching (RIDE-3), do início até o desfecho
 * (atribuída, sem motorista, fila esgotada, timeout ou cancelada).
 */
export const matchingSearchDuration = new Histogram({
  name: "matching_search_duration_seconds",
  help: "Duração da busca de matching até o desfecho",
  labelNames: ["outcome"] as const,
  buckets: [0.5, 1, 2, 5, 10, 20, 30, 60],
  registers: [registry],
});

/** Quantas buscas de matching estão em andamento agora (RIDE-3). */
export const matchingQueueSize = new Gauge({
  name: "matching_queue_size",
  help: "Número de corridas atualmente em busca de motorista",
  registers: [registry],
});

/**
 * Latência entre o motorista capturar a posição (recorded_at) e o servidor
 * consolidar e transmitir o ponto pra sala da corrida (RT-4).
 */
export const positionUpdateLatency = new Histogram({
  name: "position_update_latency_seconds",
  help: "Latência ponta a ponta da atualização de posição do motorista",
  buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10],
  registers: [registry],
});

/** Duração de uma corrida, do início (in_progress) até a conclusão. */
export const rideDuration = new Histogram({
  name: "ride_duration_seconds",
  help: "Duração da corrida entre o início e a conclusão",
  buckets: [60, 180, 300, 600, 900, 1800, 3600],
  registers: [registry],
});

/**
 * Sinal de demanda por região (RT-5). Snapshot periódico do Redis, não um
 * contador incremental: cada atualização reseta e reescreve só as células
 * atualmente ativas, pra células que esfriaram não ficarem penduradas.
 */
export const demandDriversOnline = new Gauge({
  name: "demand_drivers_online",
  help: "Motoristas online recentes por região (grade)",
  labelNames: ["cell"] as const,
  registers: [registry],
});

export const demandRequestsRecent = new Gauge({
  name: "demand_requests_recent",
  help: "Pedidos recentes por região (grade)",
  labelNames: ["cell"] as const,
  registers: [registry],
});
