import type { PrismaClient } from "@prisma/client";

/**
 * Limpa todas as tabelas de aplicação entre testes, mantendo o schema
 * (migrations já rodaram uma vez no globalSetup). Usar em beforeEach/afterEach
 * dos testes de integração que escrevem no Postgres real.
 */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
  `;

  if (tables.length === 0) {
    return;
  }

  const tableNames = tables.map((t) => `"${t.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tableNames} RESTART IDENTITY CASCADE`);
}
