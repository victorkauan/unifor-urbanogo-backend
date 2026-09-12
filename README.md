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

### `docs/planning/` - planejamento e sprints

| Documento | Conteúdo |
|---|---|
| [docs/planning/visao-geral.md](docs/planning/visao-geral.md) | Contexto do negócio, escopo, SLA e mapa de disciplinas |
| [docs/planning/roadmap.md](docs/planning/roadmap.md) | Entregas do curso e continuidade do produto |
| [docs/planning/priorizacao-sprint-1.md](docs/planning/priorizacao-sprint-1.md) | As 3 features priorizadas na sprint 1, critérios e o que ficou de fora |
| [docs/planning/atividades-sprint-1.md](docs/planning/atividades-sprint-1.md) | Desmembramento dia a dia de cada feature priorizada |
| [docs/planning/apresentacao-entrega-1-planejamento.pdf](docs/planning/apresentacao-entrega-1-planejamento.pdf) | Slides da apresentação da Entrega 1 |

### `docs/architecture/` - arquitetura e contratos

| Documento | Conteúdo |
|---|---|
| [docs/architecture/arquitetura.md](docs/architecture/arquitetura.md) | Stack, motor de matching e precificação, visão macro |
| [docs/architecture/contrato-api.md](docs/architecture/contrato-api.md) | Endpoints REST e eventos WebSocket |
| [docs/architecture/er.md](docs/architecture/er.md) | Modelo de dados |

### `docs/operations/` - operação e conformidade

| Documento | Conteúdo |
|---|---|
| [docs/operations/setup.md](docs/operations/setup.md) | Rodar o backend em desenvolvimento e produção |
| [docs/operations/deploy.md](docs/operations/deploy.md) | Deploy do MVP na VPS (Caddy, Ansible, GitHub Actions) |
| [docs/operations/devsecops.md](docs/operations/devsecops.md) | Checks de segurança no CI: audit, secret scan, SAST, Dependabot |
| [docs/operations/lgpd.md](docs/operations/lgpd.md) | Dados pessoais tratados, base legal e política de retenção |

### `docs/quality/` - testes e escala

| Documento | Conteúdo |
|---|---|
| [docs/quality/plano-de-testes.md](docs/quality/plano-de-testes.md) | Pirâmide de testes, cobertura e o que roda no CI |
| [docs/quality/relatorio-teste-de-carga.md](docs/quality/relatorio-teste-de-carga.md) | Execução do k6 contra a VPS e comparação vs SLA |
| [docs/quality/plano-de-escala.md](docs/quality/plano-de-escala.md) | Gargalos e estratégias de escala amarrados ao SLA |

### `docs/adr/` - registros de decisão

| Documento | Conteúdo |
|---|---|
| [docs/adr/](docs/adr/) | Registros de decisão (ADR), uma por decisão técnica |

## Início rápido

```bash
cp .env.example .env
npm install
npm run dev:up
npm run dev
```

`npm run dev:up` sobe PostgreSQL e Redis, aplica as migrations e popula o banco
com dados de exemplo. API em `http://localhost:3000`, rota `GET /health`. Detalhes
em [docs/operations/setup.md](docs/operations/setup.md).
