# Contrato da API e eventos WebSocket

Documento vivo. Versão 0 (Fundação). Depois do fim do dia 1 o contrato congela:
qualquer mudança passa por este arquivo e avisa o time.

## Convenções

- Base URL de desenvolvimento: `http://localhost:3000`.
- **Toda resposta** (sucesso ou erro) usa o envelope:

  ```json
  { "status_code": 200, "message": "texto", "data": { } }
  ```

  `status_code` acompanha o status HTTP. `data` traz o payload no sucesso e `null`
  no erro (erro de validação usa `data.errors`, ver abaixo).
- Autenticação: header `Authorization: Bearer <jwt>`. Rotas marcadas com 🔒 exigem
  token.
- IDs: string UUID v7. Datas: string ISO 8601 em UTC (`2026-09-06T22:00:00Z`).
- Dinheiro: inteiro em centavos, campo com sufixo `_cents`, mais `currency` (`BRL`).
- Coordenadas: `lat` e `lng` como número decimal.
- Paginação (listagens): query `?page=1&page_size=20`; resposta traz
  `data.items` e `data.page`, `data.page_size`, `data.total`.

### Enums

| Enum | Valores |
|---|---|
| `role` | `passenger`, `driver`, `both` |
| `service_preference` | `rides`, `deliveries`, `both` |
| `ride_type` | `ride`, `delivery` |
| `ride_status` | `requested`, `searching`, `assigned`, `in_progress`, `completed`, `cancelled`, `expired` |
| `offer_status` | `pending`, `accepted`, `rejected`, `timed_out`, `cancelled` |
| `cancelled_by` | `passenger`, `driver`, `system` |
| `trust_score_source` | `stub`, `llm` |

### Erros

Formato do envelope com `status_code` >= 400. `message` legível em pt-BR.

| status | quando |
|---|---|
| 400 | requisição malformada |
| 401 | sem token ou token inválido |
| 403 | autenticado, mas sem permissão para a ação |
| 404 | recurso não encontrado |
| 409 | conflito de estado (ex.: aceitar oferta já expirada) |
| 422 | payload inválido; `data.errors` traz `[{ path, message }]` |
| 429 | rate limit |
| 500 | erro interno |

Exemplo 422:

```json
{
  "status_code": 422,
  "message": "Payload inválido",
  "data": { "errors": [{ "path": "destination.lat", "message": "obrigatório" }] }
}
```

## Objetos

### user

```json
{
  "id": "uuid",
  "name": "John Doe",
  "email": "johndoe@example.com",
  "phone": "+5585999990000",
  "role": "passenger",
  "created_at": "iso"
}
```

### driver

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "service_preference": "both",
  "is_online": false,
  "vehicle_model": "Onix",
  "vehicle_plate": "ABC1D23",
  "created_at": "iso"
}
```

### ride

```json
{
  "id": "uuid",
  "type": "ride",
  "status": "searching",
  "passenger": { "id": "uuid", "name": "John Doe" },
  "driver": {
    "id": "uuid",
    "name": "Jane Doe",
    "vehicle_model": "Onix",
    "vehicle_plate": "ABC1D23",
    "trust_score": 0.92
  },
  "origin": { "lat": -3.73, "lng": -38.52, "address": "Rua das Flores, 100" },
  "destination": { "lat": -3.75, "lng": -38.49, "address": "Av. Beira Mar, 1200" },
  "distance_meters": 5400,
  "price_cents": 1890,
  "currency": "BRL",
  "price_breakdown": {
    "base_cents": 500,
    "per_km_cents": 180,
    "distance_km": 5.4,
    "multipliers": { "time": 1.0, "demand": 1.2, "weather": 1.1 },
    "service_fee_cents": 200
  },
  "requested_at": "iso",
  "assigned_at": null,
  "started_at": null,
  "completed_at": null,
  "cancelled_at": null,
  "cancelled_by": null
}
```

`driver` é `null` enquanto a corrida não é atribuída. `price_*` pode vir `null`
antes da cotação.

### rating

```json
{ "id": "uuid", "ride_id": "uuid", "rater_id": "uuid", "ratee_id": "uuid", "score": 5, "comment": "Motorista pontual e educado", "created_at": "iso" }
```

### trust_score

```json
{ "user_id": "uuid", "score": 0.92, "source": "stub", "computed_at": "iso" }
```

## Endpoints REST

### Auth

| Método | Rota | Body | Resposta `data` |
|---|---|---|---|
| POST | `/auth/register` | `{ name, email, password, phone?, role }` | `{ user, token }` (201) |
| POST | `/auth/login` | `{ email, password }` | `{ user, token }` |
| GET 🔒 | `/auth/me` | | `{ user }` |

`role` no registro: `passenger`, `driver` ou `both`. Para `driver`/`both` o perfil
de motorista ainda precisa ser criado em `POST /drivers/me`.

### Perfil do usuário

| Método | Rota | Body | Resposta `data` |
|---|---|---|---|
| GET 🔒 | `/users/me` | | `{ user }` |
| PATCH 🔒 | `/users/me` | `{ name?, phone? }` | `{ user }` |
| DELETE 🔒 | `/users/me` | | `null` (soft delete) |
| GET 🔒 | `/users/:id/ratings` | | `{ items: rating[], page, page_size, total }` |
| GET 🔒 | `/users/:id/trust-score` | | `{ trust_score }` |

### Perfil do motorista

| Método | Rota | Body | Resposta `data` |
|---|---|---|---|
| POST 🔒 | `/drivers/me` | `{ service_preference, vehicle_model?, vehicle_plate? }` | `{ driver }` (201) |
| GET 🔒 | `/drivers/me` | | `{ driver }` |
| PATCH 🔒 | `/drivers/me` | `{ service_preference?, vehicle_model?, vehicle_plate? }` | `{ driver }` |
| PUT 🔒 | `/drivers/me/availability` | `{ is_online }` | `{ is_online }` |

### Cotação

| Método | Rota | Body | Resposta `data` |
|---|---|---|---|
| POST 🔒 | `/quotes` | `{ type, origin, destination }` | `{ distance_meters, price_cents, currency, price_breakdown, expires_at }` |

`origin` e `destination`: `{ lat, lng, address? }`. A cotação é uma estimativa e
pode diferir do preço final da corrida.

### Corridas

| Método | Rota | Body | Resposta `data` |
|---|---|---|---|
| POST 🔒 | `/rides` | `{ type, origin, destination }` | `{ ride }` (201, status `searching`) |
| GET 🔒 | `/rides/:id` | | `{ ride }` |
| GET 🔒 | `/rides` | query `?role=passenger\|driver&status=&page=&page_size=` | `{ items: ride[], page, page_size, total }` |
| POST 🔒 | `/rides/:id/cancel` | `{ reason? }` | `{ ride }` (status `cancelled`) |

Ações do motorista no ciclo de vida (todas 🔒, exigem ser o motorista atribuído):

| Método | Rota | Efeito |
|---|---|---|
| POST | `/rides/:id/arrive` | marca chegada na origem |
| POST | `/rides/:id/start` | status vai para `in_progress` |
| POST | `/rides/:id/complete` | status vai para `completed` |

### Ofertas de matching

O motorista recebe a oferta pelo evento `matching:offer` (com `offer_id`) e
responde por REST:

| Método | Rota | Body | Resposta `data` |
|---|---|---|---|
| POST 🔒 | `/offers/:offerId/accept` | | `{ ride }` (status `assigned`) |
| POST 🔒 | `/offers/:offerId/reject` | | `null` |

409 se a oferta já expirou (`timed_out`) ou não está mais `pending`.

### Avaliações

| Método | Rota | Body | Resposta `data` |
|---|---|---|---|
| POST 🔒 | `/rides/:id/ratings` | `{ score, comment? }` | `{ rating }` (201) |

Só é permitido avaliar corrida `completed`, uma avaliação por parte. `score` de
1 a 5.

### Health

| Método | Rota | Resposta `data` |
|---|---|---|
| GET | `/health` | `{ uptime_seconds, timestamp }` (liveness, sempre 200, não checa dependências) |
| GET | `/ready` | `{ postgres: "ok"\|"erro", redis: "ok"\|"erro" }` (200 se ambos "ok", 503 caso contrário) |

`/ready` é o que o reverse proxy e os alertas (OBS-5) devem checar antes de
considerar a instância apta a receber tráfego.

### Métricas

| Método | Rota | Resposta |
|---|---|---|
| GET | `/metrics` | texto no formato de exposição do Prometheus (`Content-Type: text/plain`), **não** usa o envelope `{ status_code, message, data }` |

Métricas próprias, além das padrão de processo (CPU, memória, event loop) do
`prom-client`:

| Métrica | Tipo | Labels | O que mede |
|---|---|---|---|
| `http_requests_total` | Counter | `method`, `route`, `status_code` | requisições/s e taxa de erro (via `rate()` no PromQL, filtrando `status_code` >= 500) |
| `matching_search_duration_seconds` | Histogram | `outcome` (`assigned`, `no_drivers_available`, `drivers_exhausted`, `timeout`, `cancelled`) | latência do matching (RIDE-3), do início da busca até o desfecho |
| `matching_queue_size` | Gauge | — | corridas em busca de motorista agora |
| `position_update_latency_seconds` | Histogram | — | latência ponta a ponta da posição do motorista (RT-4) |
| `ride_duration_seconds` | Histogram | — | duração da corrida, de `in_progress` até `completed` |
| `demand_drivers_online` | Gauge | `cell` | motoristas online recentes por região (RT-5), recalculado a cada 15s |
| `demand_requests_recent` | Gauge | `cell` | pedidos recentes por região (RT-5), recalculado a cada 15s |

## WebSocket (Socket.IO)

Conexão em `ws://localhost:3000`. O token vai no handshake:

```js
io("http://localhost:3000", { auth: { token: "<jwt>" } });
```

Sala por corrida: `ride:{rideId}`. O passageiro e o motorista da corrida entram
na sala para receber posição e status.

### Cliente para servidor

| Evento | Payload | Descrição |
|---|---|---|
| `ride:join` | `{ ride_id }` | entra na sala da corrida. Aceita ack opcional: `socket.emit("ride:join", payload, (result) => ...)`, `result` é `{ ok: boolean }` |
| `ride:leave` | `{ ride_id }` | sai da sala. Mesmo ack opcional de `ride:join` |
| `driver:location` | `{ lat, lng, heading?, speed?, accuracy?, recorded_at }` | app do motorista envia a posição a cada 5s ou 20m de deslocamento, o que vier primeiro (decisão da RT-1, ver [ADR 0005](adr/0005-rastreamento-tempo-real.md)) |

### Servidor para cliente

| Evento | Payload | Para quem |
|---|---|---|
| `matching:offer` | `{ offer_id, ride_id, expires_at, pickup, dropoff, passenger: { name, trust_score }, distance_to_pickup_meters, price_cents }` | motorista candidato |
| `matching:cancelled` | `{ ride_id, reason }` | passageiro, quando a busca esgota ou estoura o timeout global |
| `ride:status` | `{ ride_id, status, driver?, arrived_at?, updated_at }` | sala da corrida, a cada transição de estado e também em `arrive` (que não muda `status`, só preenche `arrived_at`) |
| `ride:driver_location` | `{ ride_id, lat, lng, heading?, speed?, recorded_at, predicted }` | passageiro; posição consolidada do motorista pelo servidor (RT-4 / URB-42). `predicted` é `true` quando o ponto é extrapolado por dead reckoning entre leituras reais, `false` quando vem direto de um `driver:location` |
| `error` | `{ code, message }` | quem causou o erro |

`pickup` e `dropoff`: `{ lat, lng, address? }`. Os payloads de posição
(`driver:location`, `ride:driver_location`) estão fechados pela RT-1
([ADR 0005](adr/0005-rastreamento-tempo-real.md), URB-16). Degradação: se o
socket cair, o app cai para polling em `GET /rides/:id` a cada 10s até
reconectar.

## Fluxo de referência

1. Passageiro faz `POST /quotes`, vê o preço, faz `POST /rides`.
2. Backend cria a corrida em `searching` e dispara o matching.
3. Passageiro entra na sala com `ride:join`.
4. Cada motorista candidato recebe `matching:offer` e responde
   `POST /offers/:id/accept` ou `/reject` (ou deixa expirar em 15s).
5. No aceite, a corrida vira `assigned`, todos na sala recebem `ride:status`.
6. Motorista envia `driver:location` em intervalo; passageiro recebe
   `ride:driver_location`.
7. Motorista faz `arrive`, `start`, `complete`; cada passo emite `ride:status`.
8. Cada parte faz `POST /rides/:id/ratings`.
9. Se a busca falha, o passageiro recebe `matching:cancelled`.

## Pendências

- Refresh token / expiração do JWT: definir na USR-1.
- Webhook ou push notification para o app fora do socket: fora do escopo do MVP.
