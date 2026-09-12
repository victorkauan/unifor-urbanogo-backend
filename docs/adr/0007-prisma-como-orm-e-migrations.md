# 0007. Usar Prisma como ORM e ferramenta de migrations

* **Status:** Aceito
* **Data:** 2026-09-06

## Contexto

O backend precisa de acesso a dados tipado sobre PostgreSQL e de um jeito de
versionar a evolução do schema do banco ao longo do projeto, com uma equipe
pequena trabalhando em paralelo sobre o mesmo banco.

## Decisão

Vamos usar **Prisma** como ORM, incluindo o **Prisma Migrate** para versionar o
schema (pasta `prisma/migrations` versionada no repositório). Para a consulta de
proximidade por haversine, que o Prisma não expressa nativamente, o acesso cai
para SQL cru via `$queryRaw`.

## Alternativas Consideradas

Não há registro de alternativas avaliadas formalmente (ex.: TypeORM, Drizzle,
SQL cru com um query builder). Prisma foi escolhido diretamente por entregar
modelos tipados, cliente gerado e migrations no mesmo pacote, sem montar essas
três peças separadamente sob o prazo do projeto.

## Consequências

* **Positivas:**
  * Modelos, tipos do TypeScript e migrations vêm de uma fonte única
    (`schema.prisma`), sem sincronizar manualmente.
  * Migrations versionadas no git dão histórico auditável do schema.
* **Negativas:**
  * Trocar de banco relacional depois do MVP custa mais caro por causa do
    acoplamento ao Prisma; risco aceito para o prazo do projeto.
  * Consultas que o Prisma não expressa bem (como a haversine) exigem cair
    para SQL cru via `$queryRaw`, perdendo parte da tipagem automática nesses
    pontos.
