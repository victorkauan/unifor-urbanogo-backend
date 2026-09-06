import { buildApp } from "./app.js";
import { config } from "./lib/config.js";

const app = await buildApp();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    app.log.info({ signal }, "shutting down");
    app
      .close()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  });
}

try {
  await app.listen({ port: config.PORT, host: config.HOST });
} catch (err) {
  app.log.error({ err }, "failed to start server");
  process.exit(1);
}
