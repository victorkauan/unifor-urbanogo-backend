import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: "./test/global-setup.ts",
    testTimeout: 20_000,
    hookTimeout: 30_000,
    // testes de integração compartilham um único Postgres/Redis reais
    // (globalSetup); arquivos em paralelo mutando as mesmas tabelas causam
    // condição de corrida entre eles (ex.: um TRUNCATE no meio do seed de outro).
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/server.ts"],
    },
  },
});
