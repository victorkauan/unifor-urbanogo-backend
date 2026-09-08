import jwt, { type SignOptions } from "jsonwebtoken";
import { config } from "./config.js";

export interface JwtPayload {
  sub: string;
}

export function signToken(
  payload: JwtPayload,
  expiresIn: SignOptions["expiresIn"] = "1d",
): string {
  return jwt.sign(payload, config.JWT_SECRET, { expiresIn });
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, config.JWT_SECRET);
  if (typeof decoded === "string" || typeof decoded.sub !== "string") {
    throw new Error("Token sem claim sub válida");
  }
  return { sub: decoded.sub };
}
