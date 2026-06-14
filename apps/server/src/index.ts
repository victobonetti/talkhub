import Fastify, { type FastifyError } from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ROOM_AMBIENTE } from "@talkhub/shared";
import { ZodError } from "zod";
import { env } from "./env.js";
import { AmbienteRoom } from "./rooms/AmbienteRoom.js";
import { authRoutes } from "./routes/auth.js";
import { avatarRoutes } from "./routes/avatar.js";

async function main(): Promise<void> {
  const fastify = Fastify({ logger: true });
  await fastify.register(cors, { origin: true });
  await fastify.register(jwt, { secret: env.JWT_SECRET });

  fastify.decorate("authenticate", async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      await reply.code(401).send({ error: "unauthorized" });
    }
  });

  // Erros de validação zod -> 400 com detalhes.
  fastify.setErrorHandler((err: FastifyError, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: "validation_error", issues: err.issues });
    }
    fastify.log.error(err);
    const statusCode = typeof err.statusCode === "number" ? err.statusCode : 500;
    return reply.code(statusCode).send({ error: err.message });
  });

  fastify.get("/health", async () => ({ ok: true, ts: Date.now() }));
  await fastify.register(authRoutes);
  await fastify.register(avatarRoutes);

  // Colyseus compartilha o mesmo servidor HTTP do Fastify (mesma porta).
  const gameServer = new Server({
    transport: new WebSocketTransport({ server: fastify.server }),
  });
  gameServer.define(ROOM_AMBIENTE, AmbienteRoom);

  await fastify.listen({ port: env.PORT, host: env.HOST });
  fastify.log.info(`Talkhub realtime + REST em ${env.HOST}:${env.PORT}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
