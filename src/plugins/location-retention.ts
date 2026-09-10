import fp from "fastify-plugin";
import { config } from "../lib/config.js";
import { runLocationRetentionSweep } from "../modules/privacy/location-retention.js";

const HOUR_IN_MS = 60 * 60 * 1000;

/**
 * Roda a varredura de retenção de localização (SEC-4) de tempos em tempos dentro
 * do próprio processo, para o MVP não depender de um cron externo. O job também
 * pode ser disparado sozinho por `npm run privacy:purge-locations`.
 */
export const locationRetentionPlugin = fp(
  async (app) => {
    if (config.NODE_ENV === "test") {
      return;
    }

    const retentionConfig = {
      rideLocationRetentionDays: config.RIDE_LOCATION_RETENTION_DAYS,
      driverLocationRetentionHours: config.DRIVER_LOCATION_RETENTION_HOURS,
    };

    const sweep = () => {
      runLocationRetentionSweep({
        prisma: app.prisma,
        config: retentionConfig,
        logger: app.log,
      }).catch((err: unknown) => {
        app.log.error({ err }, "varredura de retenção de localização falhou");
      });
    };

    const timer = setInterval(sweep, config.LOCATION_RETENTION_SWEEP_HOURS * HOUR_IN_MS);
    timer.unref();

    app.addHook("onReady", async () => {
      sweep();
    });

    app.addHook("onClose", async () => {
      clearInterval(timer);
    });
  },
  { name: "location-retention", dependencies: ["prisma"] },
);
