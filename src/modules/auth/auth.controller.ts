import type { FastifyReply, FastifyRequest } from "fastify";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";
import { signToken } from "../../lib/jwt.js";
const prisma = new PrismaClient();

type RegisterBody = {
  name: string;
  email: string;
  password: string;
  role: "passenger" | "driver" | "both";
};

type LoginBody = {
  email: string;
  password: string;
};

export async function register(req: FastifyRequest<{ Body: RegisterBody }>, reply: FastifyReply) {
  const { name, email, password, role } = req.body;

  const userExists = await prisma.user.findUnique({ where: { email } });
  if (userExists) {
    return reply.fail(409, "Email already in use");
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash,
      role,
    },
  });

  return reply.status(201).send({ id: user.id, email: user.email, role: user.role });
}

export async function login(req: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return reply.fail(401, "Invalid credentials");
  }

  const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
  if (!isPasswordValid) {
    return reply.fail(401, "Invalid credentials");
  }

  const token = signToken({ sub: user.id }, "7d");

  return reply.send({ token });
}
