# UrbanoGo - Mobilidade Urbana (Caronas/Entregas)

Projeto da disciplina de pós-graduação em DevOps (UNIFOR) - Equipe 06.

Aplicativo de mobilidade urbana que conecta motoristas parceiros a passageiros e a
pequenas entregas na cidade, com matching por proximidade e nota de confiança,
precificação dinâmica e rastreamento em tempo real. Este repositório é o backend
(Node.js + Fastify). O app Flutter fica em repositório separado.

## Equipe

- João Victor Silva Almeida (2519093)
- Matheus Guimarães de Paula (2518306)
- Tiago da Silva Nascimento (2519090)
- Victor Kauan Lima de Oliveira (2518877)

## Documentação

| Documento | Conteúdo |
|---|---|
| [docs/visao-geral.md](docs/visao-geral.md) | Contexto do negócio, escopo, SLA e mapa de disciplinas |
| [docs/arquitetura.md](docs/arquitetura.md) | Stack, motor de matching e precificação, visão macro |
| [docs/roadmap.md](docs/roadmap.md) | Entregas do curso e continuidade do produto |
| [docs/contrato-api.md](docs/contrato-api.md) | Endpoints REST e eventos WebSocket |
| [docs/er.md](docs/er.md) | Modelo de dados |
| [docs/setup.md](docs/setup.md) | Rodar o backend em desenvolvimento e produção |
| [docs/deploy.md](docs/deploy.md) | Deploy do MVP na VPS (Caddy, Ansible, GitHub Actions) |
| [docs/devsecops.md](docs/devsecops.md) | Checks de segurança no CI: audit, secret scan, SAST, Dependabot |
| [docs/adr/0001-stack.md](docs/adr/0001-stack.md) | Decisões de stack e convenções de código |

## Início rápido

```bash
cp .env.example .env
npm install
npm run dev:up
npm run dev
```

`npm run dev:up` sobe PostgreSQL e Redis, aplica as migrations e popula o banco
com dados de exemplo. API em `http://localhost:3000`, rota `GET /health`. Detalhes
em [docs/setup.md](docs/setup.md).
