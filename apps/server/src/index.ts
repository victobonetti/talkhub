import Fastify from "fastify";
import cors from "@fastify/cors";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { ROOM_AMBIENTE } from "@talkhub/shared";
import { env } from "./env.js";
import { AmbienteRoom } from "./rooms/AmbienteRoom.js";

async function main(): Promise<void> {
  const fastify = Fastify({ logger: true });
  await fastify.register(cors, { origin: true });

  fastify.get("/health", async () => ({ ok: true, ts: Date.now() }));

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
