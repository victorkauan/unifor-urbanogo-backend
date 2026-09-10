# Testes de carga (k6)

Scripts k6 para os cenários de pico do UrbanoGo (URB-58): carga no endpoint de
solicitação de corrida + matching, e carga no socket de posição do motorista.
Servem de insumo pra URB-64 (execução formal do teste de carga e relatório vs
SLA).

- `rush.js` - pico normal, oferta de motoristas equilibrada (2 passageiros
  por motorista, por padrão).
- `chuva.js` - pico de chuva: poucos motoristas pra muito pedido (5
  passageiros por motorista, por padrão), estressando o motor de matching.
  Não controla o clima de verdade (o multiplicador de clima em
  `pricing-multipliers.ts` usa o Open-Meteo real) - simula só o efeito
  operacional: gente evitando dirigir com chuva.

Nenhum dos dois pré-semeia posição no banco: motoristas ficam `is_online` e
só se tornam descobríveis pro matching quando mandam `driver:location` de
verdade via socket, durante a carga (é esse caminho ponta a ponta que o teste
exercita).

## Rodando

Precisa da API rodando (local ou de outro jeito acessível) e do k6 instalado
(ou via Docker, `grafana/k6`).

```bash
BASE_URL=http://localhost:3000 k6 run load-tests/rush.js
```

Com Docker (Windows/Git Bash - use `MSYS_NO_PATHCONV=1` senão o caminho do
volume é reescrito errado; `host.docker.internal` acessa a API rodando no
host):

```bash
MSYS_NO_PATHCONV=1 docker run --rm \
  --add-host host.docker.internal:host-gateway \
  -v "$(pwd)/load-tests:/scripts:ro" \
  -e BASE_URL=http://host.docker.internal:3000 \
  grafana/k6:0.54.0 run /scripts/rush.js
```

## Parâmetros (env vars)

| Variável | Padrão | O que é |
|---|---|---|
| `BASE_URL` | `http://localhost:3000` | URL da API (HTTP) |
| `WS_URL` | deriva de `BASE_URL` (`http`→`ws`) | URL do socket |
| `DURATION` | `2m` | Duração de cada cenário |
| `DRIVER_VUS` | 10 (rush) / 5 (chuva) | VUs simulando motoristas |
| `PASSENGER_VUS` | 20 (rush) / 25 (chuva) | VUs simulando passageiros |
| `CENTER_LAT`, `CENTER_LNG` | Fortaleza (-3.7319, -38.5267) | Centro de onde motoristas e corridas são espalhados (jitter de 1-3km) |
| `RECONCILE_INTERVAL_MS` | `1000` | De quanto em quanto tempo o passageiro consulta `GET /rides/:id` esperando o "assigned" |
| `PASSENGER_THINK_MIN_S`, `PASSENGER_THINK_MAX_S` | `3`, `8` | Faixa da pausa do passageiro entre uma tentativa e outra |

Os dois últimos existem pra dar controle fino sobre a taxa total de requisições -
importante se o ambiente alvo tiver rate limiting (ex.: contra um ambiente
publicado real, ver `docs/relatorio-teste-de-carga.md`): aumentar o intervalo de
polling e a pausa do passageiro reduz bastante o número de requisições/minuto sem
mudar o número de VUs.

Exemplo, pico maior por 5 minutos:

```bash
k6 run -e DRIVER_VUS=20 -e PASSENGER_VUS=40 -e DURATION=5m load-tests/rush.js
```

## O que cada VU faz

- **Motorista** (`driverIteration`, `lib/flows.js`): conecta no socket,
  manda `driver:location` a cada 5s (ADR 0002) por até 30s, aceita a
  primeira oferta que receber e passa pelo ciclo de vida (`arrive` → `start`
  → `complete`) pra voltar a ficar livre. Cada VU cria sua própria conta na
  primeira iteração e mantém essa identidade até o fim do teste (ver
  `lib/setup.js` - não dá pra indexar um pool por `__VU` porque o k6 não
  garante que os IDs de VU de um cenário sejam contíguos quando há mais de
  um cenário no mesmo teste).
- **Passageiro** (`passengerIteration`): pede uma corrida, entra na sala do
  socket, e mede o tempo até `assigned` consultando `GET /rides/:id`
  (timestamp `assigned_at` do servidor - não dá pra confiar só no push via
  socket: se o matching for rápido o suficiente, o "assigned" pode ser
  emitido antes do passageiro terminar o handshake do WS + `ride:join`, e
  esse evento não tem replay). Depois de cada tentativa (com ou sem
  motorista disponível), espera um "tempo de pensar" de 3-8s antes de pedir
  de novo - sem isso, poucos VUs conseguem gerar uma taxa de pedidos bem
  maior do que o cenário pretende, e a proporção "N passageiros por
  motorista" perde sentido.

## SLA de referência (docs/visao-geral.md)

- Matching: menor que 3s, ponta a ponta, do pedido até o motorista atribuído
  - métrica `{name}_matching_latency_ms` (ex.: `rush_matching_latency_ms`).
- Posição: menor que 5s (ADR 0002) - a carga do socket de posição roda em
  paralelo via `driver:location`, mas este script não mede a latência de
  entrega dessa posição especificamente (isso é `ws_msgs_sent`/
  `ws_msgs_received` e a saúde geral do socket sob carga).

`{name}_ride_outcomes` (com a tag `outcome`) mostra a distribuição de
desfechos: `completed`, `cancelled`, `expired` (motor de matching não achou
motorista a tempo) e `timed_out` (o próprio script desistiu depois de
esperar `PASSENGER_MAX_WAIT_MS`).

## Sobre os números com poucos motoristas

Com poucos motoristas simulados (padrão de `chuva.js`, ou qualquer
`DRIVER_VUS` baixo), o teto de corridas atendidas por segundo é limitado
pelo ciclo aceite→conclusão de cada motorista (por volta de 3.5s no script),
não pela demanda de passageiros. Uma taxa alta de `no_drivers_available`/
`expired` nesse regime é o comportamento ESPERADO (é literalmente o que
`chuva.js` quer estressar), não um bug do script.
