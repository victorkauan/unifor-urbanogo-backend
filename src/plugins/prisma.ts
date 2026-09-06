import fp from "fastify-plugin";
import { PrismaClient } from "@prisma/client";

declare module "fastify" {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

export const prismaPlugin = fp(
  async (app) => {
    const prisma = new PrismaClient();

    app.decorate("prisma", prisma);

    app.addHook("onReady", async () => {
      try {
        await prisma.$connect();
        app.log.info("database connected");
      } catch (err) {
        app.log.error({ err }, "database unavailable at boot");
      }
    });

    app.addHook("onClose", async () => {
      await prisma.$disconnect();
    });
  },
  { name: "prisma" },
);
