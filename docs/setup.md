# Setup do backend

Requisitos: Node 24 (`.nvmrc`), npm e Docker.

## Desenvolvimento

`docker-compose.yml` sobe só a infraestrutura (PostgreSQL e Redis). A API roda na
máquina, com hot reload, via npm.

```bash
cp .env.example .env
npm install
npm run dev:up
npm run dev
```

`npm run dev:up` sobe a infraestrutura, espera ficar saudável, aplica as
migrations e roda o seed. API em `http://localhost:3000`, rota `GET /health`.

## Produção

`docker-compose.prod.yml` usa a imagem buildada, sem bind mount, com `restart` e
segredos vindos de um `.env` no servidor.

```bash
cp .env.prod.example .env   # preencher POSTGRES_PASSWORD e JWT_SECRET
docker compose -f docker-compose.prod.yml up -d --build
```

## Scripts npm

| Script | O que faz |
|---|---|
| `npm run dev` | API em watch mode |
| `npm run dev:up` | Sobe a infraestrutura, aplica migrations e roda o seed |
| `npm run dev:down` | Derruba a infraestrutura |
| `npm run dev:reset` | Derruba com volumes e sobe tudo de novo do zero |
| `npm run build` | Compila para `dist/` |
| `npm start` | Roda o build |
| `npm run lint` | ESLint + Prettier (check) |
| `npm run format` | Prettier (write) |
| `npm test` | Testes (Vitest). Testes com `describe.runIf(RUN_DB_TESTS === "1")` rodam contra Postgres/Redis reais |
| `npm run db:migrate` | Migrations do Prisma |
| `npm run db:generate` | Gera o Prisma Client |
| `npm run db:seed` | Popula o banco com dados de teste |

## Variáveis de ambiente

| Variável | Obrigatória | Padrão | Descrição |
|---|---|---|---|
| `NODE_ENV` | não | `development` | `development`, `test` ou `production` |
| `HOST` | não | `0.0.0.0` | interface de bind |
| `PORT` | não | `3000` | porta HTTP |
| `LOG_LEVEL` | não | `info` | nível de log do pino |
| `DATABASE_URL` | sim | | string de conexão do PostgreSQL |
| `REDIS_URL` | sim | | string de conexão do Redis |
| `JWT_SECRET` | sim | | segredo para assinar os JWT (mínimo 16 caracteres) |
| `RUN_DB_TESTS` | não | | `"1"` sinaliza que `DATABASE_URL`/`REDIS_URL` apontam para um banco alcançável; liga os testes de integração (`describe.runIf`) |

## Testes de integração (RUN_DB_TESTS)

Testes que tocam Postgres/Redis de verdade ficam atrás de
`describe.runIf(process.env.RUN_DB_TESTS === "1")` (convenção da URB-19/31), em
vez de sempre exigir banco disponível. Duas formas de satisfazer isso:

* **CI**: o workflow já sobe Postgres e Redis via `services:` do GitHub Actions
  e define `RUN_DB_TESTS=1` fixo (ver `.github/workflows/ci.yml`).
* **Local**: `npm test` sobe Postgres e Redis efêmeros via Testcontainers
  automaticamente (Docker precisa estar rodando) através do `globalSetup` do
  Vitest, aplica as migrations e liga `RUN_DB_TESTS=1` sozinho. Se
  `RUN_DB_TESTS` já estiver setado (por exemplo, você mesmo subiu infra com
  `npm run dev:up` e exportou a variável) ou se o Docker não estiver
  disponível, o `globalSetup` não sobe containers próprios: no primeiro caso
  para não duplicar infra, no segundo os testes de integração ficam pulados e
  o resto da suíte roda normalmente.
