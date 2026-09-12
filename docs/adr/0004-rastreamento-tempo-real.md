# 0004. Estratégia de rastreamento em tempo real

* **Status:** Aceito
* **Data:** 2026-09-07
* **Decisão:** Tiago (RT-1 / URB-16)

## Contexto

O professor questionou se apps como Uber e iFood realmente ficam mandando
milhares de requisições para acompanhar a posição do motorista. Não ficam:
enviam a posição em intervalos e o cliente preenche o movimento entre uma
atualização e outra. Esta ADR fecha os números para o UrbanoGo, dentro do SLA
já definido (posição do motorista em menos de 5s) e do payload do socket
(`driver:location` / `ride:driver_location`) descrito em
[docs/contrato-api.md](../contrato-api.md).

## Decisão

* **Frequência de envio (app do motorista):** o app envia `driver:location` a
  cada **5 segundos ou 20 metros de deslocamento, o que vier primeiro**. Os
  dois gatilhos evitam dois problemas opostos: só por tempo, o marcador fica
  impreciso a velocidades altas; só por distância, o motorista parado nunca
  atualiza (o passageiro não saberia que a conexão ainda está viva).
* **Interpolação no cliente:** o app do passageiro nunca "pula" o marcador
  para a posição nova. Ao receber `ride:driver_location`, ele anima o
  marcador da posição anterior até a nova ao longo da janela do próximo
  intervalo esperado (~5s). Se a atualização seguinte chegar antes de a
  animação terminar, a animação em curso é cancelada e uma nova começa da
  posição atual (não da última posição alvo).
* **Predição de trajeto:** estimativa por **dead reckoning** — entre
  atualizações, projeta a posição usando `heading` e `speed` do último
  payload (linha reta na direção do heading). Aceita errar uma curva, o
  próximo ponto corrige. O evento `ride:driver_location` carrega o campo
  `predicted: boolean` para o cliente saber se aquele ponto é uma leitura
  real do motorista ou uma extrapolação do servidor entre leituras.
* **O que trafega no socket:** só o delta de posição, sempre por sala da
  corrida (`ride:{rideId}`), nunca broadcast geral. Cliente → servidor:
  `driver:location` com a leitura bruta do GPS. Servidor → clientes da sala:
  `ride:driver_location` com a posição consolidada (agregação e throttle do
  servidor, RT-4 / URB-42), não um repasse 1:1 de cada leitura recebida.
* **Degradação:** se o socket cair, o app do passageiro detecta a
  desconexão e cai para **polling REST leve em `GET /rides/:id`, a cada 10
  segundos**, só enquanto o socket estiver fora. Ao reconectar, volta para o
  modo socket e o polling para.

## Alternativas Consideradas

* **Polling HTTP puro, sem WebSocket** (o baseline "ingênuo" de app fazendo
  `GET` a cada 500ms para parecer "tempo real"): rejeitado como estratégia
  principal — para uma corrida de 20 minutos, geraria 2400 requisições contra
  240 mensagens de socket na abordagem escolhida (redução de 10x), e cada
  mensagem de socket é mais barata que uma requisição HTTP nova (sem
  handshake TCP/TLS repetido). Mantido só como fallback de degradação, a um
  intervalo mais frouxo de 10s, quando o socket cai.
* **Snap-to-road via OSRM desde o início** (`nearest`/`match`, para grudar a
  posição predita nas ruas): considerado, mas adiado como melhoria pós-MVP —
  não é obrigatório para o SLA de 5s e não bloqueia esta decisão.

## Consequências

* **Positivas:**
  * Cumpre o SLA de posição em menos de 5s no caminho normal, com o pior
    caso (5s entre leituras reais) coberto pela interpolação/predição no
    meio do caminho.
  * Redução de ~10x no número de mensagens em relação a polling ingênuo, com
    cada mensagem de socket mais barata que uma requisição HTTP nova.
  * `driver:location` e `ride:driver_location` deixam de ser "provisórios"
    no contrato de API; os campos ficam fechados.
* **Negativas:**
  * O motorista parado ou em baixa velocidade ainda consome o gatilho de
    tempo (5s), mesmo sem deslocamento relevante.
  * Dead reckoning erra em curvas fechadas até a próxima leitura real
    corrigir a posição.
  * O fallback de polling degrada o SLA de posição de 5s para 10s enquanto o
    socket estiver fora.

## Histórico

* 2026-09-07: versão inicial.
* 2026-09-11: reformatado para o modelo padrão de ADR do projeto (seções de
  Alternativas Consideradas e Consequências explícitas).
