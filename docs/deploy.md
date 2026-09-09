# Deploy do MVP

Ambiente público da demo (Entrega 2), numa VPS Hostinger KVM 1 (1 vCPU, 4 GB,
Debian). A stack inteira roda em Docker Compose atrás de um reverse proxy Caddy
com HTTPS automático.

## O que sobe

`docker-compose.prod.yml`:

| Serviço | Porta no host | Descrição |
|---|---|---|
| `caddy` | 80, 443 | único ponto público; TLS automático; faz proxy da API e do Grafana |
| `api` | interna | Fastify (`target: runtime` do `Dockerfile`), buildada na VPS |
| `db` | interna | PostgreSQL 17 |
| `redis` | interna | Redis 7 (AOF) |
| `prometheus` | `127.0.0.1:9090` | scrape de `api:3000/metrics`; só via túnel SSH |
| `grafana` | interna | dashboards e alertas (URB-53/57/62) |
| `migrate` | one-shot | `prisma migrate deploy`, profile `tools`, não sobe no `up` |

URLs resultantes (com `PUBLIC_HOST=<ip-com-tracos>.sslip.io`):

- API e app: `https://<PUBLIC_HOST>/`
- Grafana: `https://grafana.<PUBLIC_HOST>/`
- `GET /metrics` responde `403` na borda (o Prometheus lê pela rede interna).

O `sslip.io` resolve qualquer `<a-b-c-d>.sslip.io` para o IP `a.b.c.d`, então não
precisa mexer em DNS. Trocar por um domínio real depois é só mudar `PUBLIC_HOST`.

## Deploy automático (GitHub Actions)

`.github/workflows/deploy.yml` roda a cada push em `develop` e no botão
"Run workflow" (`workflow_dispatch`). Ele instala Ansible, conecta na VPS por SSH
e roda `deploy/ansible/playbook.yml`, que provisiona a máquina (Docker, ufw,
fail2ban, unattended-upgrades) e sobe a stack: `up -d db redis` →
`--profile tools run --rm migrate` → `up -d --build` → checa `https://<host>/health`.

### Secrets e variáveis do repositório

Environment `production` (Settings → Environments → production):

| Tipo | Nome | Valor |
|---|---|---|
| secret | `VPS_HOST` | IP ou host da VPS |
| secret | `VPS_SSH_KEY` | chave SSH privada com acesso à VPS (PEM completo) |
| secret | `PUBLIC_HOST` | ex.: `203-0-113-10.sslip.io` |
| secret | `POSTGRES_PASSWORD` | senha do Postgres |
| secret | `JWT_SECRET` | segredo dos JWT (>= 16 chars) |
| secret | `GRAFANA_ADMIN_PASSWORD` | senha do admin do Grafana |
| secret | `ALERT_WEBHOOK_URL` | webhook do canal de alertas |
| secret | `DEEPINFRA_API_KEY` | opcional; vazio = nota de confiança pela média |
| variable | `VPS_USER` | opcional; usuário SSH (default `root`) |

A chave pública correspondente a `VPS_SSH_KEY` precisa estar em
`~/.ssh/authorized_keys` do `VPS_USER` na VPS.

## Deploy manual

Da sua máquina, com Ansible instalado e acesso SSH à VPS:

```bash
cd deploy/ansible
cp inventory.example.ini inventory.ini        # ajuste IP e ansible_user
cp group_vars/all.example.yml group_vars/all.yml
# preencha public_host e os segredos em group_vars/all.yml (não commitar)

ansible-playbook -i inventory.ini playbook.yml
```

Os segredos também podem vir do ambiente em vez do `group_vars/all.yml`:
`PUBLIC_HOST`, `POSTGRES_PASSWORD`, `JWT_SECRET`, `GRAFANA_ADMIN_PASSWORD`,
`ALERT_WEBHOOK_URL`, `DEEPINFRA_API_KEY`, `GIT_VERSION` (ref a implantar,
default `develop`).

## Operar direto na VPS

```bash
cd /opt/urbanogo
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml --profile tools run --rm migrate
docker compose -f docker-compose.prod.yml up -d --build      # redeploy manual
```

O `.env` de produção fica em `/opt/urbanogo/.env` (modo `0600`), gerado pelo
playbook a partir de `deploy/ansible/templates/env.j2`. Nunca vai pro git.

Prometheus só escuta em `127.0.0.1:9090` na VPS; para abrir a UI localmente:
`ssh -L 9090:127.0.0.1:9090 <user>@<vps>` e acesse `http://localhost:9090`.

## App do Matheus

Apontar a base URL da API para `https://<PUBLIC_HOST>` (certificado válido,
emitido pelo Let's Encrypt via `sslip.io`). Sem porta, sem `http`.
