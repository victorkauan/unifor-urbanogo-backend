# Setup do backend

Requisitos: Node 24 (`.nvmrc`), npm e Docker.

## Desenvolvimento

`docker-compose.yml` sobe só a infraestrutura (PostgreSQL e Redis). A API roda na
máquina, com hot reload, via npm.

```bash
cp .env.example .env
npm install
docker compose up -d
npm run dev
```

API em `http://localhost:3000`, rota `GET /health`.

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
| `npm run build` | Compila para `dist/` |
| `npm start` | Roda o build |
| `npm run lint` | ESLint + Prettier (check) |
| `npm run format` | Prettier (write) |
| `npm test` | Testes (Vitest) |
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
