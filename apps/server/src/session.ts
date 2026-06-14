import jwt from "jsonwebtoken";
import { env } from "./env.js";

export interface SessionPayload {
  sub: string; // userId
  kind: "google" | "guest";
  name: string;
}

/** Verifica um JWT de sessão (mesmo segredo do @fastify/jwt, HS256). */
export function verifySession(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  try {
    const p = jwt.verify(token, env.JWT_SECRET);
    if (typeof p === "object" && p !== null && "sub" in p) {
      return p as SessionPayload;
    }
    return null;
  } catch {
    return null;
  }
}
