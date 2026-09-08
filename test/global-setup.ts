import { execSync } from "node:child_process";
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";

let postgresContainer: StartedTestContainer | undefined;
let redisContainer: StartedTestContainer | undefined;

/**
 * RUN_DB_TESTS=1 é a convenção do time (ver .github/workflows/ci.yml, URB-19)
 * para sinalizar que já existe um Postgres/Redis alcançável em DATABASE_URL /
 * REDIS_URL, e que os testes com `describe.runIf(process.env.RUN_DB_TESTS === "1")`
 * devem rodar. O CI já fornece isso via `services:` do GitHub Actions.
 *
 * Localmente, sem essa infra pronta, este globalSetup sobe Postgres e Redis
 * efêmeros via Testcontainers, aplica as migrations e liga a mesma flag - sem
 * duplicar infra quando o CI (ou um dev) já forneceu uma.
 */
export async function setup() {
  process.env.NODE_ENV = process.env.NODE_ENV ?? "test";
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-only-secret-min-16-chars";
  process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? "silent";

  if (process.env.RUN_DB_TESTS === "1") {
    return;
  }

  // fallback para o schema de config validar mesmo sem containers: testes que
  // não tocam banco/Redis de verdade usam mocks e não dependem disso ser alcançável.
  process.env.DATABASE_URL ??=
    "postgresql://urbanogo:urbanogo@localhost:5432/urbanogo_unreachable?schema=public";
  process.env.REDIS_URL ??= "redis://localhost:6379";

  try {
    [postgresContainer, redisContainer] = await Promise.all([
      new GenericContainer("postgres:17-alpine")
        .withEnvironment({
          POSTGRES_USER: "urbanogo",
          POSTGRES_PASSWORD: "urbanogo",
          POSTGRES_DB: "urbanogo_test",
        })
        .withExposedPorts(5432)
        .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
        .start(),
      new GenericContainer("redis:7-alpine")
        .withExposedPorts(6379)
        .withWaitStrategy(Wait.forLogMessage(/Ready to accept connections/))
        .start(),
    ]);
  } catch (err) {
    console.warn(
      "Docker indisponível: subindo sem Postgres/Redis via Testcontainers. Testes com " +
        "RUN_DB_TESTS ficam pulados. Para rodá-los localmente, abra o Docker Desktop, ou " +
        "aponte DATABASE_URL/REDIS_URL para um banco já existente e defina RUN_DB_TESTS=1.",
    );
    if (process.env.CI) {
      throw err;
    }
    return;
  }

  const databaseUrl =
    `postgresql://urbanogo:urbanogo@${postgresContainer.getHost()}:` +
    `${postgresContainer.getMappedPort(5432)}/urbanogo_test?schema=public`;
  const redisUrl = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;

  process.env.DATABASE_URL = databaseUrl;
  process.env.REDIS_URL = redisUrl;
  process.env.RUN_DB_TESTS = "1";

  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: "inherit",
  });
}

export async function teardown() {
  await redisContainer?.stop();
  await postgresContainer?.stop();
}
