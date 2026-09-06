# ADR 0001 - Stack e convenções do backend

Status: Aceito
Data: 2026-09-06
Decisão da equipe (Victor Kauan, João Victor, Tiago, Matheus)

## Contexto

O backend do UrbanoGo é um serviço único em Node.js + Fastify + TypeScript, com
PostgreSQL, Redis e Socket.IO. O prazo é curto (tudo pronto até 10/09, 4 pessoas)
e várias trilhas rodam em paralelo, então as decisões abaixo existem para que
ninguém trave esperando definição.

## Decisões

| Tema | Decisão | Motivo |
|---|---|---|
| Linguagem | TypeScript | já fechado no planejamento |
| Framework HTTP | Fastify | leve, rápido, plugins |
| Acesso a dados | Prisma | modelos, tipos e migrations num pacote só; consultas cruas via `$queryRaw` quando precisar (haversine) |
| Migrations | Prisma Migrate | sai de graça do Prisma; pasta `prisma/migrations` versionada |
| Validação de payload | Zod | ergonomia, reaproveita o schema como DTO no contrato; integra via `fastify-type-provider-zod` |
| Estrutura de código | Por domínio (feature) | módulo fechado por assunto, fácil trabalhar em paralelo |
| Versão do Node | 24 LTS | fixada em `.nvmrc` e no `engines` do `package.json` |
| Gerenciador de pacotes | npm | zero setup para o time |
| Envelope de resposta | `{ status_code, message, data }` em toda resposta | previsibilidade no app, um só parser no cliente |
| Estratégia de ID | UUID v7 | ordenável, sem coordenação entre devs, seguro expor |
| Data e hora | `timestamptz`, tudo em UTC | evita ambiguidade de fuso |
| Cliente HTTP externo | `fetch` nativo do Node 24 | DeepInfra, Open-Meteo e OSRM sem dependência extra |
| Timeouts do matching | 15s de aceite por motorista, 60s de busca global, via `setTimeout` em processo | sem fila (BullMQ) no MVP |

## Detalhes

### Estrutura de pastas

```
src/
  modules/
    auth/      users/     drivers/   rides/
    matching/  pricing/   ratings/   realtime/
      <modulo>.routes.ts    rotas Fastify do módulo
      <modulo>.service.ts   regra de negócio
      <modulo>.repo.ts      acesso a dados (Prisma ou SQL cru)
      <modulo>.schema.ts    schemas Zod de entrada e saída
  plugins/     plugins Fastify com fastify-plugin (db, redis, auth, swagger)
  lib/         config, errors, logger, helpers de resposta
  app.ts       monta o Fastify e registra plugins e módulos
  server.ts    sobe o processo (porta, sinais)
prisma/
  schema.prisma
  migrations/
```

Regras:

- Cross-cutting (pool do Postgres, client do Redis, decorator de auth) entra como
  plugin Fastify registrado com `fastify-plugin`.
- Um módulo não importa arquivos internos de outro módulo. Se precisar, expõe pelo
  `service`.
- `lib/config.ts` lê as variáveis de ambiente uma vez, valida com Zod e exporta um
  objeto tipado. Nada de `process.env` espalhado pelo código.

### Envelope de resposta

Toda resposta da API, sucesso ou erro, tem o mesmo formato:

```ts
type ApiResponse<T = unknown> = {
  status_code: number;   // igual ao status HTTP da resposta
  message: string;       // texto curto legível por humano
  data: T | null;        // payload no sucesso, null no erro
};
```

Sucesso:

```json
{
  "status_code": 200,
  "message": "Corrida criada",
  "data": { "id": "018f...", "status": "buscando" }
}
```

Erro simples:

```json
{
  "status_code": 404,
  "message": "Corrida não encontrada",
  "data": null
}
```

Erro de validação (Zod): o detalhe dos campos vai dentro de `data`, mantendo o
contrato de três chaves:

```json
{
  "status_code": 422,
  "message": "Payload inválido",
  "data": { "errors": [{ "path": "destino.lat", "message": "obrigatório" }] }
}
```

Implementação:

- Helper `reply.ok(data, message?, statusCode = 200)` e
  `reply.fail(statusCode, message, data = null)` decorados no Fastify.
- `setErrorHandler` central converte qualquer erro (incluindo os de schema do
  Fastify e as `AppError` da aplicação) para o envelope.
- `setNotFoundHandler` devolve o envelope com `status_code` 404.
- Classe base `AppError(statusCode, message, data?)` em `lib/errors.ts`; os
  services lançam subclasses (`NotFoundError`, `ConflictError`, etc.).

### Timeouts do matching

Confirmando o que já estava no planejamento:

- Aceite por motorista: 15 segundos. Estourou ou recusou, a oferta passa para o
  próximo da fila.
- Busca global: 60 segundos. A fila esgotou ou o tempo acabou sem aceite, a
  corrida é cancelada e o passageiro é avisado.
- Implementação com `setTimeout` no próprio processo da API. O estado da busca
  (fila, elo atual, deadline) fica no Redis para sobreviver a um restart durante
  a demo.

### Convenções gerais

- Lint e format: ESLint + Prettier, rodando no CI (URB-17).
- Scripts npm: `dev`, `build`, `start`, `lint`, `test`, `db:migrate`, `db:seed`.
- Commits e PRs: um PR por tarefa do Linear, pequeno, CI verde antes do merge.
- Nomes de tabela e coluna em `snake_case`; Prisma mapeia para `camelCase` no
  código via `@map`.
- Testes de integração que precisam de banco real sobem PostgreSQL e Redis
  efêmeros com Testcontainers (biblioteca `testcontainers`), não com o compose de
  desenvolvimento. O harness é montado na tarefa TST-1.

## Consequências

- O app (Matheus) pode assumir o envelope de três chaves desde o primeiro mock.
- Trocar de banco relacional depois custa mais por causa do Prisma, risco aceito
  para o prazo do MVP.
- Sem fila dedicada, o matching não escala horizontalmente ainda. O plano de
  escala (URB-63) trata disso.
- `setTimeout` em processo significa que a instância da API fica stateful durante
  uma busca ativa. Aceitável no MVP de instância única.

## Histórico

- 2026-09-06: versão inicial.
- 2026-09-06: adicionada a decisão de Testcontainers para testes de integração.
