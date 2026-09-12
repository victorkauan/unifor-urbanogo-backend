# 0015. Usar Testcontainers para testes de integração

* **Status:** Aceito
* **Data:** 2026-09-06

## Contexto

Parte da suíte de testes precisa validar comportamento contra um PostgreSQL e
um Redis reais (não mockados) — por exemplo, a consulta de proximidade por
haversine e o estado de busca do matching no Redis. É preciso decidir como
subir essa infraestrutura durante os testes, tanto localmente quanto no CI, sem
depender de um ambiente compartilhado que possa ficar sujo entre execuções.

## Decisão

Testes de integração que precisam de banco real sobem **PostgreSQL e Redis
efêmeros com a biblioteca `testcontainers`**, não com o `docker-compose.yml` de
desenvolvimento. Os contêineres sobem uma vez por execução da suíte, via
`globalSetup` do Vitest, e as migrations do Prisma rodam contra esse banco
antes dos testes começarem.

## Alternativas Consideradas

* **Reaproveitar o `docker-compose.yml` de desenvolvimento:** mais simples à
  primeira vista, mas o estado de um teste vaza para o próximo (banco não é
  efêmero), e exige que o Compose de dev já esteja de pé antes de rodar
  testes, o que não funciona bem no CI.
* **Banco compartilhado de CI, subido manualmente no workflow (sem
  Testcontainers):** funciona, mas duplica a definição de infraestrutura entre
  o `docker-compose.yml` de dev e o YAML do CI, e não roda do mesmo jeito na
  máquina de cada desenvolvedor.

## Consequências

* **Positivas:**
  * Cada execução da suíte parte de um banco e um Redis limpos, sem
    interferência entre execuções nem com o ambiente de desenvolvimento.
  * O mesmo mecanismo funciona igual localmente e no CI (GitHub Actions), sem
    duplicar definição de infraestrutura de teste.
* **Negativas:**
  * Cada execução da suíte paga o custo de subir e derrubar contêineres, o
    que é mais lento que apontar para um banco já de pé.
  * Exige Docker disponível em qualquer máquina ou runner que rode a suíte de
    integração.
