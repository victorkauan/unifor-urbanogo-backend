# Plano de escala

`TST-6` · Onde o backend do UrbanoGo aperta quando a carga sobe, e como cada
gargalo seria resolvido, amarrado ao SLA de [`visao-geral.md`](visao-geral.md#sla-desejado).
Usa os números medidos na URB-64 ([`relatorio-teste-de-carga.md`](relatorio-teste-de-carga.md)).

## Baseline atual

Tudo numa **VPS Hostinger KVM 1 (1 vCPU, 4 GB RAM, Debian)**, um container de cada:
API Fastify, PostgreSQL 17, Redis 7, Caddy, Prometheus, Grafana. Sem redundância,
sem réplica, sem balanceador com mais de um destino.

Pontos do desenho relevantes para escala:

* **Matching**: Chain of Responsibility, uma oferta por vez, timeout de aceite de
  15s, timeout global de 60s. Os timers são `setTimeout` no próprio processo da
  API; o estado da busca (fila, elo atual, deadline) fica no Redis. A instância
  fica efetivamente *stateful* durante uma busca ativa.
* **WebSocket**: Socket.IO em nó único, adapter em memória. Não há set de presença
  por conexão de socket: o candidato a matching sai da tabela `driver_locations` e
  da flag `is_online` (mantida pelo endpoint REST de disponibilidade), não de quem
  está de fato com o socket aberto.
* **Proximidade**: haversine em SQL, varredura de bounding box + cálculo de
  distância por linha em `driver_locations`, índice B-tree em `(lat, lng)`. Sem
  PostGIS.
* **Rate limit**: 100 req/60s por IP, contador no Redis (já seguro entre
  instâncias).
* **Clima**: chamada ao Open-Meteo por `POST /quotes`, sem cache (não está no
  caminho de `POST /rides`).
* **Nota de confiança**: LLM (DeepInfra) assíncrona, com cache no Redis e fallback
  pela média. Baixo risco.

## O que o teste de carga mostrou (URB-64)

Carga modesta (~53-63 req/min, abaixo do rate limit de propósito, então **não é um
teste de capacidade**):

| Métrica | rush (2 mot., 3 pass., 5 min) | chuva (1 mot., 4 pass., 5 min) | Meta |
|---|---|---|---|
| Latência de matching, mediana | 77 ms | 73 ms | < 3 s |
| Latência de matching, p90 | 95 ms | 89 ms | < 3 s |
| Latência de matching, p95 | **11,4 s** | 1,6 s | < 3 s |
| Latência de matching, máx | 30,1 s | 30,1 s | < 3 s |
| Erros reais | 0% | 0% | ~0% |
| Handshake de WebSocket | 100% | 100% | - |

Leitura: **a mediana passa com folga enorme** (77 ms contra 3 s), o caminho feliz
do matching é rápido. **A cauda viola o SLA**: casos raros levam ~15 s ou ~30 s.
Capacidade máxima, disponibilidade e latência de posição no mapa **não foram
medidas** (o rate limit forçou carga baixa; a latência de posição não está
instrumentada nos scripts).

## Gargalos

### 1. Motor de matching

* **Cauda de 15-30 s (medida).** A oferta vai para um candidato por vez e espera
  os 15 s inteiros do timeout antes de passar adiante. Se ela cai num motorista
  cujo socket sumiu naquele instante (janela de reconexão, ou conta de teste
  antiga ainda marcada `online` no banco sem ninguém escutando), aquela oferta
  queima 15 s à toa. Com pool pequeno (1-2 motoristas), dois "elos perdidos" em
  sequência dão ~30 s. É o desenho atual ficando visível, não bug do script.
* **Estado no processo.** Os `setTimeout` de 15 s/60 s e a orquestração da cadeia
  vivem no processo da API. Subir uma segunda instância não resolve: ela não
  conhece os timers nem a fila que a primeira está tocando. O estado está no
  Redis, mas não há coordenação de quem é o dono de cada busca.
* **CPU única.** Node single-thread num 1 vCPU: a orquestração do matching, o
  broadcast por socket e o atendimento HTTP disputam o mesmo event loop.

### 2. Fan-out do socket

* Socket.IO em nó único com adapter em memória. Com mais de uma instância de API,
  um `ride:status` ou uma posição emitidos na instância A **não chegam** aos
  clientes conectados na instância B.
* Um processo só segura todas as conexões WebSocket; a contagem de conexões e o
  custo de CPU por mensagem limitam o throughput de tempo real.
* Sem set de presença real: o matching oferta para quem está `is_online` no banco,
  não para quem está de fato com o socket aberto (causa raiz da cauda acima).

### 3. Proximidade no PostgreSQL

* `nearby-drivers` faz varredura de bounding box + haversine por linha a cada
  solicitação de corrida, no primary único (que também aguenta todas as escritas).
  O índice B-tree em `(lat, lng)` ajuda o range, não a ordenação por distância.
* Hoje `driver_locations` só é escrita pelo seed (a posição viva está no Redis).
  Para o matching usar a posição real em escala, essa tabela passa a receber
  escrita de alta frequência, multiplicando a carga no primary.

### 4. Pontos únicos de falha

* Um primary Postgres, um Redis, um processo de API, uma VPS. Sem redundância,
  **99,9% de disponibilidade é inatingível**: um restart, um deploy ou um pico de
  memória no 1 vCPU já é indisponibilidade. Deploy hoje = downtime.

### 5. Dependências externas

* Open-Meteo por `POST /quotes`, sem cache: latência e superfície de falha extras,
  e sujeito ao rate limit do provedor sob carga.

## Estratégias por meta de SLA

### Disponibilidade 99,9%

* **API sem estado + escala horizontal.** Depende de tirar o estado do matching do
  processo (ver abaixo) e ligar o adapter de Redis no socket. Com isso, rodar 2+
  instâncias atrás do Caddy (que já é o balanceador), com deploy rolling e dreno
  por health check, elimina o downtime de deploy.
* **Postgres replicado**: primary + standby com failover, ou no mínimo PITR e
  restore rápido testado. Redis com persistência e réplica.
* **Sair da máquina única**: VPS maior ou 2+ nós (Compose Swarm / Nomad / k8s
  pequeno). Sem isso o número de disponibilidade não fecha, independente do
  código.

### Matching < 3s (matar a cauda)

* **Ofertar em paralelo aos N melhores** (ou em lotes pequenos), com timeout por
  oferta menor (5-8 s), primeiro que aceitar leva, cancela o resto. Acaba com o
  "um motorista morto custa 15 s". A ordem da cadeia (distância + nota de
  confiança) vira a ordem do lote.
* **Só ofertar para socket vivo.** Set de presença no Redis mantido pelo
  connect/disconnect do socket; o matching filtra candidatos por presença real.
* **Expurgar motorista `online` fantasma.** TTL de presença: quem parou de mandar
  posição sai da candidatura. Complementa a varredura da SEC-4, que já limpa
  `driver_locations` de motorista offline.
* **Estado do matching coordenado.** Mover os timers e a fila para um mecanismo
  que qualquer instância consegue tocar: fila dedicada (BullMQ / Redis Streams)
  ou lock + reconciliação por deadline no Redis. É o que torna a API realmente
  stateless. É o maior esforço da lista.

### Posição no mapa < 5s

* **Adapter de Redis no Socket.IO**: um broadcast em qualquer instância chega a
  todos os inscritos. Destrava o WebSocket multi-instância.
* **Tier de WebSocket dedicado**, separado do tier REST, para um pico de
  requisições não travar o event loop que empurra as posições. Sticky session no
  balanceador para as conexões WS.
* Posição já vive no Redis com TTL curto e o broadcast já é throttled no servidor
  (RT-4); manter.

### Escala de leitura e proximidade

* **Redis GEO** (`GEOADD` / `GEOSEARCH`) para "motoristas online mais próximos": a
  posição já está no Redis, a busca é O(log n + m), e tira essa consulta do
  primary Postgres de vez.
* Alternativa/adicional: **PostGIS** com índice GiST na coluna de posição, e
  **réplicas de leitura** do Postgres para `nearby-drivers` e `GET /rides`.
* **Particionamento por região** (prefixo de geohash): matching, sinal de demanda
  e proximidade passam a operar dentro de uma célula, limitando o conjunto de
  candidatos e permitindo escalar células de forma independente.

### Backpressure e degradação graciosa

* **Rate limit por IP** já é a primeira camada. Somar um **limite global de
  concorrência** com fast-fail (`503` + `Retry-After`) quando a profundidade da
  fila de matching ou o lag do event loop passam de um limiar. O gauge
  `matchingQueueSize` já existe para acionar isso.
* **Degradar, não bloquear**: se o sinal de demanda ou o clima estão lentos ou
  falhando, seguir sem o multiplicador (já é o fallback) em vez de segurar a
  cotação. Se o matching está saturado, responder "sem motorista, tente de novo"
  mais rápido em vez de segurar o passageiro por 60 s.
* **Circuit breaker** no Open-Meteo (com cache curto por célula) e no DeepInfra
  (que já tem fallback).
* **Load shedding na borda** (Caddy) para rotas não críticas sob pressão.

## Ordem sugerida

1. Set de presença no Redis + filtrar candidatos por socket vivo, e ofertar em
   lote curto com timeout menor. Resolve a cauda medida sem reescrever o motor.
2. Adapter de Redis no Socket.IO. Destrava rodar 2+ instâncias de API.
3. Redis GEO para a proximidade. Tira a consulta quente do Postgres.
4. Estado do matching fora do processo (fila dedicada). API stateless de verdade.
5. Postgres com réplica/standby e sair da VPS única. Fecha o número de
   disponibilidade.
6. Particionamento por região, quando o volume justificar.

## O que ainda não sabemos

* **Teto real de throughput.** O rate limit de produção forçou carga baixa no
  teste. Próximo passo: exceção de rate limit para o IP do gerador de carga (ou
  `RATE_LIMIT_MAX` alto temporário na VPS) numa execução controlada.
* **Latência de posição ponta a ponta.** Não instrumentada nos scripts k6.
* **Causa exata da cauda.** A hipótese (janela de reconexão + contas de teste
  fantasma) precisa de acesso a logs da VPS para confirmar.
