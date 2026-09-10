import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { config } from "../lib/config.js";
import {
  runLocationRetentionSweep,
  type RetentionLogger,
} from "../modules/privacy/location-retention.js";

const logger: RetentionLogger = {
  info: (obj, msg) => console.log(msg, JSON.stringify(obj)),
  error: (obj, msg) => console.error(msg, obj),
};

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await runLocationRetentionSweep({
      prisma,
      config: {
        rideLocationRetentionDays: config.RIDE_LOCATION_RETENTION_DAYS,
        driverLocationRetentionHours: config.DRIVER_LOCATION_RETENTION_HOURS,
      },
      logger,
    });
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}
