import "@fastify/jwt";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { SessionPayload } from "./session.js";

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
