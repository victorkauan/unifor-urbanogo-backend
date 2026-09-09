# LGPD: dados pessoais, base legal e retenção

Mapa dos dados pessoais tratados pelo backend do UrbanoGo, a base legal de cada
grupo (Lei 13.709/2018, art. 7 e art. 11) e por quanto tempo cada coisa fica
guardada. Serve de referência para o time e define o que o job de expurgo e
anonimização (SEC-4, URB-65) precisa apagar ou anonimizar.

Fonte dos campos: `prisma/schema.prisma` e [docs/er.md](er.md). Controlador: Equipe
06 (projeto acadêmico). Não há tratamento de dados de crianças e adolescentes nem,
por ora, de categorias sensíveis.

## Grupos de dados

### 1. Identificação e contato

| Campo | Origem | Observação |
|---|---|---|
| `users.name` | cadastro | nome da pessoa |
| `users.email` | cadastro | identificador de login, único |
| `users.phone` | cadastro | opcional |
| `users.password_hash` | cadastro | hash bcrypt, nunca a senha em claro |

* **Finalidade**: criar e manter a conta, autenticar, permitir contato entre
  passageiro e motorista durante uma corrida.
* **Base legal**: execução de contrato (art. 7, V). O telefone também se apoia em
  legítimo interesse (art. 7, IX) para contato operacional na corrida.
* **Retenção**: enquanto a conta estiver ativa. Após a exclusão da conta (marcada
  em `users.deleted_at`), anonimizar ou apagar em até 30 dias, salvo o que
  precise ser mantido por obrigação legal ou para exercício de direito em
  processo (art. 16).

### 2. Dados do veículo (motorista)

| Campo | Origem |
|---|---|
| `drivers.vehicle_model` | perfil do motorista |
| `drivers.vehicle_plate` | perfil do motorista |
| `drivers.service_preference`, `drivers.is_online` | perfil e operação |

* **Finalidade**: identificar o veículo para o passageiro, operar o matching.
* **Base legal**: execução de contrato (art. 7, V). A placa, por identificar
  indiretamente uma pessoa, segue a mesma retenção do grupo 1.
* **Retenção**: junto com a conta do motorista.

### 3. Localização

| Campo | Origem | Natureza |
|---|---|---|
| `rides.origin_lat/lng`, `rides.dest_lat/lng` | solicitação da corrida | ponto preciso |
| `rides.origin_address`, `rides.dest_address` | solicitação da corrida | texto livre de endereço |
| `driver_locations` (Postgres) | telemetria do app do motorista | última posição conhecida, via upsert, sem histórico |
| chave `driver:{id}:location` (Redis) | telemetria | posição atual, TTL de 15s |
| sinal de demanda por célula (Redis) | derivado das posições | agregado por região, TTL curto, sem id de pessoa |
| histórico de posições (tabela futura, SEC-4) | telemetria | trilha completa do trajeto |

* **Finalidade**: casar passageiro e motorista por proximidade, mostrar a corrida
  no mapa em tempo real, calcular preço por distância, alimentar o sinal de
  demanda.
* **Base legal**: execução de contrato (art. 7, V) para a corrida em andamento.
  A geolocalização precisa é o dado mais sensível do produto: o histórico de
  trajetos depende de **consentimento** específico e destacado (art. 7, I), com
  opção de recusar sem perder o serviço de corrida.
* **Retenção**:
  * Redis (posição atual e demanda): efêmero, expira sozinho em segundos. Nada a
    fazer.
  * `driver_locations` no Postgres: só a última posição, sobrescrita a cada
    atualização. Ao ficar offline ou 24h sem atualizar, apagar a linha.
  * `rides.origin/dest` lat/lng e endereços: mantidos com a corrida por **18
    meses** (janela de disputa e conciliação financeira). Depois disso,
    arredondar as coordenadas para ~1 km e apagar os campos de endereço.
  * Histórico de posições (SEC-4): manter os pontos brutos por **90 dias**.
    Depois, anonimizar (remover `driver_id` e `ride_id`, arredondar lat/lng) ou
    apagar. É o alvo principal do job do URB-65.

### 4. Corrida e transação

| Campo | Origem |
|---|---|
| `rides` (status, marcos de tempo, `distance_meters`) | operação da corrida |
| `rides.price_cents`, `rides.price_breakdown` | precificação |
| `ride_offers` (log da fila de ofertas) | motor de matching |
| `rides.cancelled_by`, `rides.cancelled_reason` | cancelamento |

* **Finalidade**: executar a corrida, cobrar o valor correto, auditar o matching,
  atender suporte e disputas.
* **Base legal**: execução de contrato (art. 7, V) e legítimo interesse (art. 7,
  IX) para prevenção a fraude e auditoria do algoritmo.
* **Retenção**: registro financeiro da corrida mantido por **5 anos** (prazo
  geral de prescrição, art. 206 do Código Civil), já sem os dados de localização
  precisa conforme o grupo 3. `ride_offers` pode ser reduzido a agregado após
  **90 dias**.

### 5. Avaliações e nota de confiança

| Campo | Origem | Observação |
|---|---|---|
| `ratings.score` | avaliação pós-corrida | nota de 1 a 5 |
| `ratings.comment` | avaliação pós-corrida | texto livre, pode citar terceiros |
| `trust_scores.score` | cálculo | nota de 0 a 1 |
| `trust_scores.source`, `trust_scores.rationale` | cálculo | `rationale` é texto gerado por LLM |

* **Finalidade**: reputação mútua, insumo do matching, segurança da comunidade.
* **Base legal**: legítimo interesse (art. 7, IX), com teste de proporcionalidade:
  o titular avaliado pode pedir revisão e contestar (art. 20, decisão
  automatizada).
* **Retenção**: `score` mantido enquanto a conta existir. `ratings.comment` e
  `trust_scores.rationale` (texto livre) apagados após **18 meses**, mantendo só
  os valores numéricos.

### 6. Sessão e registros técnicos

| Dado | Origem | Observação |
|---|---|---|
| JWT | login | carrega apenas `sub` = UUID do usuário, sem nome nem e-mail |
| colunas de auditoria (`created_by_id`, `updated_by_id`, `deleted_by_id`) | sistema | só UUID, sem FK |
| logs da aplicação | Fastify/pino | método, rota, status, UUID do usuário; sem corpo de requisição |
| IP de origem | proxy Caddy e logs | |

* **Finalidade**: autenticar, rastrear ação por usuário, operar, investigar
  incidente de segurança.
* **Base legal**: legítimo interesse (art. 7, IX) e, para o registro de acesso,
  cumprimento de obrigação legal (Marco Civil da Internet, art. 15: guarda de
  logs de aplicação por 6 meses).
* **Retenção**: logs de aplicação por **30 dias**; registros de acesso
  (IP + timestamp) por **6 meses**, depois anonimizar o IP. Backups do Postgres
  por **30 dias**, com o expurgo se propagando dentro dessa janela.

## Compartilhamento e transferência internacional

| Destino | O que vai | Base e salvaguarda |
|---|---|---|
| DeepInfra (LLM da nota de confiança, EUA) | histórico de avaliações: `score`, `comment` e data, dos últimos 20 registros | legítimo interesse; **sem identificadores diretos** (nome, e-mail, id) no payload. Transferência internacional apoiada em cláusulas do fornecedor. Se `DEEPINFRA_API_KEY` não estiver setada, nada é enviado e a nota cai na média simples. |
| OSM / OSRM | coordenadas para rota e geocodificação | dado de localização sem identificador de pessoa |
| Open-Meteo | coordenadas aproximadas para clima | idem |
| VPS Hostinger | hospeda toda a stack | operador de tratamento; Brasil/UE conforme região do plano |

Nenhum dado pessoal é vendido ou usado para publicidade.

## Direitos do titular (art. 18)

| Direito | Como é atendido hoje |
|---|---|
| Confirmação e acesso | endpoints de perfil (`GET`) do próprio usuário |
| Correção | endpoints de perfil (`PATCH`) |
| Eliminação | exclusão de conta faz soft delete (`deleted_at`); o hard delete/anonimização em 30 dias depende do job do SEC-4 |
| Portabilidade | pendente: exportação do perfil, corridas e avaliações em JSON |
| Revisão de decisão automatizada | pendente: canal para contestar a nota de confiança |
| Informação sobre compartilhamento | este documento |

## Pendências que viram tarefa

* **SEC-4 (URB-65)**: job que apaga/anonimiza o histórico de posições após 90
  dias, arredonda as coordenadas das corridas após 18 meses e limpa
  `driver_locations` de motoristas offline. Documentar a execução aqui.
* Índice de retenção configurável por env (`LOCATION_HISTORY_RETENTION_DAYS` e
  afins) em vez de valores fixos no código.
* Endpoint de portabilidade (exportar dados do titular em JSON).
* Fluxo de contestação da nota de confiança (art. 20).
* Anonimização do IP nos logs após 6 meses.
* Redação explícita de cabeçalho `authorization` e campos sensíveis na config do
  pino (hoje o logger não loga corpo de requisição, mas não há `redact` no lugar).
