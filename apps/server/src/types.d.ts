import "@fastify/jwt";
import type { FastifyReply, FastifyRequest } from "fastify";

export interface SessionPayload {
  sub: string; // userId
  kind: "google" | "guest";
  name: string;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: SessionPayload;
    user: SessionPayload;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
