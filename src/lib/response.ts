import fp from "fastify-plugin";
import type { FastifyReply } from "fastify";

export interface ApiResponse<T = unknown> {
  status_code: number;
  message: string;
  data: T | null;
}

declare module "fastify" {
  interface FastifyReply {
    ok<T>(data: T, message?: string, statusCode?: number): FastifyReply;
    fail(statusCode: number, message: string, data?: unknown): FastifyReply;
  }
}

export const responsePlugin = fp(
  async (app) => {
    app.decorateReply(
      "ok",
      function (this: FastifyReply, data: unknown, message = "OK", statusCode = 200) {
        const body: ApiResponse = { status_code: statusCode, message, data: data ?? null };
        return this.code(statusCode).send(body);
      },
    );

    app.decorateReply(
      "fail",
      function (this: FastifyReply, statusCode: number, message: string, data: unknown = null) {
        const body: ApiResponse = { status_code: statusCode, message, data };
        return this.code(statusCode).send(body);
      },
    );
  },
  { name: "response-envelope" },
);
