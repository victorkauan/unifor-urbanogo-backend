import type { FastifyReply, FastifyRequest } from "fastify";
import bcrypt from "bcryptjs";
import { signToken } from "../../lib/jwt.js";
import { serializeUser } from "../users/user.serializer.js";
import { authUserId } from "./auth-user.js";

const BCRYPT_ROUNDS = 10;
const TOKEN_TTL = "7d";

interface RegisterBody {
  name: string;
  email: string;
  password: string;
  phone?: string;
  role: "passenger" | "driver" | "both";
}

interface LoginBody {
  email: string;
  password: string;
}

export async function register(req: FastifyRequest, reply: FastifyReply) {
  const { name, email, password, phone, role } = req.body as RegisterBody;

  const existing = await req.server.prisma.user.findUnique({ where: { email } });
  if (existing) {
    return reply.fail(409, "E-mail já cadastrado");
  }

  const user = await req.server.prisma.user.create({
    data: {
      name,
      email,
      phone: phone ?? null,
      role,
      passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
    },
  });

  const token = signToken({ sub: user.id }, TOKEN_TTL);
  return reply.ok({ user: serializeUser(user), token }, "Conta criada", 201);
}

export async function login(req: FastifyRequest, reply: FastifyReply) {
  const { email, password } = req.body as LoginBody;

  const user = await req.server.prisma.user.findFirst({ where: { email, deletedAt: null } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return reply.fail(401, "Credenciais inválidas");
  }

  const token = signToken({ sub: user.id }, TOKEN_TTL);
  return reply.ok({ user: serializeUser(user), token }, "Login efetuado");
}

export async function me(req: FastifyRequest, reply: FastifyReply) {
  const userId = authUserId(req);
  if (!userId) {
    return reply.fail(401, "Não autenticado");
  }

  const user = await req.server.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
  if (!user) {
    return reply.fail(401, "Conta inválida");
  }

  return reply.ok({ user: serializeUser(user) }, "Usuário atual");
}
