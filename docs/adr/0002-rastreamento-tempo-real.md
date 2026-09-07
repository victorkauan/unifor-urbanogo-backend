# ADR 0002 - Estratégia de rastreamento em tempo real

Status: Aceito
Data: 2026-09-07
Decisão: Tiago (RT-1 / URB-16)

## Contexto

O professor questionou se apps como Uber e iFood realmente ficam mandando
milhares de requisições para acompanhar a posição do motorista. Não ficam:
enviam a posição em intervalos e o cliente preenche o movimento entre uma
atualização e outra. Esta ADR fecha os números para o UrbanoGo, dentro do SLA
já definido (posição do motorista em menos de 5s) e do payload do socket
(`driver:location` / `ride:driver_location`) descrito em
[docs/contrato-api.md](../contrato-api.md).

## Decisão

### 1. Frequência de envio (app do motorista)

O app envia `driver:location` a cada **5 segundos ou 20 metros de
deslocamento, o que vier primeiro**. Os dois gatilhos evitam dois problemas
opostos: só por tempo, o marcador fica impreciso a velocidades altas; só por
distância, o motorista parado nunca atualiza (o passageiro não saberia que a
conexão ainda está viva).

### 2. Interpolação no cliente

O app do passageiro nunca "pula" o marcador para a posição nova. Ao receber
`ride:driver_location`, ele anima o marcador da posição anterior até a nova ao
longo da janela do próximo intervalo esperado (~5s), com `requestAnimationFrame`
ou o equivalente do Flutter (`TweenAnimationBuilder`/`AnimationController`).
Se a atualização seguinte chegar antes de a animação terminar, a animação em
curso é cancelada e uma nova começa da posição atual (não da última posição
alvo), para não travar nem saltar.

### 3. Predição de trajeto

Estimativa por **dead reckoning**: entre atualizações, projeta a posição
usando `heading` e `speed` do último payload (linha reta na direção do
heading). Aceita errar uma curva, o próximo ponto corrige. Snap-to-road via
OSRM (`nearest` / `match`) fica como melhoria pós-MVP para suavizar o traçado
sobre as ruas, não é obrigatório para a Entrega 2 e não bloqueia esta tarefa.
O evento `ride:driver_location` carrega o campo `predicted: boolean` para o
cliente saber se aquele ponto é uma leitura real do motorista ou uma
extrapolação do servidor entre leituras.

### 4. O que trafega no socket

Só o delta de posição, sempre por sala da corrida (`ride:{rideId}`), nunca
broadcast geral:

- Cliente → servidor: `driver:location` com a leitura bruta do GPS.
- Servidor → clientes da sala: `ride:driver_location` com a posição
  consolidada (agregação e throttle do servidor, tarefa RT-4 / URB-42), não um
  repasse 1:1 de cada leitura recebida.

O servidor pode agregar leituras de múltiplos motoristas em memória e no
Redis (RT-2 / URB-34), mas cada emissão para o cliente é sempre escopada à
sala de uma corrida específica.

### 5. Degradação

Se o socket cair, o app do passageiro detecta a desconexão e cai para
**polling REST leve em `GET /rides/:id`, a cada 10 segundos**, só enquanto o
socket estiver fora. Ao reconectar, volta para o modo socket e o polling
para. Isso ainda cumpre o SLA de forma degradada (posição a cada 10s no pior
caso, contra 5s no caminho normal) sem exigir um canal alternativo novo.

### 6. Conta rápida (redução vs. polling ingênuo)

Baseline ingênuo: cliente faz `GET` HTTP a cada 500ms para parecer "tempo
real" (2 requisições/s), comum quando não existe push.

Nossa abordagem: 1 emissão de socket a cada 5s.

Para uma corrida de 20 minutos (1200s):

| Abordagem | Intervalo | Mensagens na corrida |
|---|---|---|
| Polling ingênuo (HTTP) | 500 ms | 1200 / 0.5 = **2400** |
| UrbanoGo (socket) | 5 s | 1200 / 5 = **240** |

Redução de **10x** no número de mensagens, e cada mensagem de socket é muito
mais barata que uma requisição HTTP (sem handshake TCP/TLS novo, sem headers
repetidos, conexão já mantida aberta), então a economia real de CPU/rede do
servidor é maior que só a razão de contagem. Com atualização a cada 5s e
interpolação no cliente, o SLA de posição em menos de 5s é atendido no
caminho normal (pior caso: 5s entre leituras reais, coberto pela
interpolação/predição no meio do caminho).

## Consequências

- `driver:location` e `ride:driver_location` deixam de ser "provisórios" no
  contrato de API; os campos ficam fechados (ver
  [docs/contrato-api.md](../contrato-api.md)).
- RT-2 (URB-34, ingestão no Redis) e RT-4 (URB-42, estratégia de posição no
  servidor) implementam o throttle/agregação e o campo `predicted` decididos
  aqui.
- Snap-to-road via OSRM não é obrigatório para a Entrega 2; fica registrado
  como melhoria futura, sem nova issue por ora.
- O fallback de polling REST usa uma rota que já existe (`GET /rides/:id`),
  sem endpoint novo.

## Histórico

- 2026-09-07: versão inicial.
