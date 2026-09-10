# DevSecOps

Controles de segurança que rodam de forma automática no repositório. O objetivo
é que toda alteração passe pelos mesmos checks antes de entrar em `develop`, e que
uma falha apareça direto no Pull Request.

## O que roda no CI

O workflow [`.github/workflows/security.yml`](../.github/workflows/security.yml)
roda em todo push para `main` e `develop`, em todo Pull Request e uma vez por
semana (agendado). São três jobs independentes:

| Job | Ferramenta | O que verifica | Quando falha |
|---|---|---|---|
| `dependency audit` | `npm audit` | Vulnerabilidades conhecidas nas dependências | Vulnerabilidade `high` ou maior em dependência de produção |
| `secret scan` | [TruffleHog](https://github.com/trufflesecurity/trufflehog) | Credenciais commitadas na árvore de arquivos | Qualquer segredo verificado encontrado |
| `static analysis` | [Semgrep](https://semgrep.dev) | Padrões inseguros no código (injeção, uso incorreto de crypto, path traversal, etc.) | Qualquer achado das regras `p/typescript`, `p/nodejs`, `p/javascript`, `p/security-audit` |

O `dependency audit` roda dois passos: um bloqueante só com as dependências de
produção (`--omit=dev --audit-level=high`) e um informativo com a árvore completa
em nível `moderate` (`continue-on-error`), para acompanhar dívidas de
`devDependencies` sem travar o PR.

## Dependabot

[`.github/dependabot.yml`](../.github/dependabot.yml) abre PRs semanais de
atualização para três ecossistemas: `npm`, `github-actions` e `docker`. As
atualizações `minor` e `patch` de npm vêm agrupadas em um único PR.

## Overrides de dependência

O `package.json` fixa versões corrigidas de pacotes transitivos que não têm
release direto pelos pacotes que os puxam:

| Override | Motivo |
|---|---|
| `undici@^6` | `openai` puxava `undici@5` com CVE de alta severidade (CRLF / response poisoning) |
| `uuid@^11.1.1` | `dockerode` (via `testcontainers`, dev) puxava `uuid` com o GHSA-w5hq-g745-h8pq |
| `deepmerge-ts@^8` | corrige a cadeia de `@prisma/config` (ver histórico) |

## Ajustes manuais no GitHub (uma vez)

Alguns controles são configuração do repositório, não arquivo. Em
**Settings → Code security**:

* **Dependabot alerts** e **Dependabot security updates**: ligar. Complementa o
  `npm audit` do CI com alertas fora do ciclo de PR.
* **Secret scanning** e **Push protection**: ligar se o plano do repositório
  permitir. É a rede nativa do GitHub, além do TruffleHog no CI.
* **Marcar os checks como obrigatórios**: em **Settings → Branches**, na regra de
  `develop`, exigir os checks `dependency audit`, `secret scan` e
  `static analysis` para permitir o merge.

## Hardening da API (SEC-3)

`src/plugins/security.ts` aplica, em toda a API:

| Controle | Plugin | Config |
|---|---|---|
| Cabeçalhos de segurança | `@fastify/helmet` (padrões) | `nosniff`, `X-Frame-Options`, HSTS, etc. |
| CORS | `@fastify/cors` | `CORS_ORIGINS` (lista separada por vírgula). Vazio reflete qualquer origem e, em produção, loga um aviso. A mesma lista vale para o Socket.IO. |
| Rate limiting | `@fastify/rate-limit` | `RATE_LIMIT_MAX` (padrão 100) por `RATE_LIMIT_WINDOW_MS` (padrão 60000). Contador no Redis, compartilhado entre instâncias. `/health`, `/ready` e `/metrics` ficam de fora. Estouro devolve `429` no envelope padrão. |

Validação de entrada: toda rota com corpo, parâmetro de path ou query string tem
schema Zod (`fastify-type-provider-zod`); payload inválido devolve `422` com a
lista de erros. As rotas sem schema (`GET /health`, `GET /*/me`, `DELETE /users/me`)
não recebem entrada do cliente.

TLS: encerrado pelo Caddy no deploy (ver [deploy.md](deploy.md)), com certificado
automático (Let's Encrypt ou CA interna). A aplicação fala HTTP só na rede interna
do Compose.
