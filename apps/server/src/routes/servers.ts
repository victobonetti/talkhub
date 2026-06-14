import type { FastifyInstance } from "fastify";
import { matchMaker } from "@colyseus/core";
import {
  CELL_SIZE,
  ROOM_AMBIENTE,
  ServerCreateSchema,
  type AmbienteFullDto,
  type AmbienteMetaDto,
  type ServerListItem,
} from "@talkhub/shared";
import { prisma } from "../db.js";

/** Conta jogadores online por ambienteId consultando as salas ativas do Colyseus. */
async function onlineByAmbiente(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  try {
    const rooms = await matchMaker.query({ name: ROOM_AMBIENTE });
    for (const r of rooms) {
      const aid = (r.metadata as { ambienteId?: string } | undefined)?.ambienteId;
      if (aid) counts.set(aid, (counts.get(aid) ?? 0) + (r.clients ?? 0));
    }
  } catch {
    /* matchMaker indisponível: retorna zeros */
  }
  return counts;
}

function metaDto(a: {
  id: string;
  name: string;
  widthPx: number;
  heightPx: number;
  spawnX: number;
  spawnY: number;
  chatRadius: number;
}): AmbienteMetaDto {
  return {
    id: a.id,
    name: a.name,
    wCells: a.widthPx / CELL_SIZE,
    hCells: a.heightPx / CELL_SIZE,
    spawnX: a.spawnX,
    spawnY: a.spawnY,
    chatRadius: a.chatRadius,
  };
}

export async function serverRoutes(app: FastifyInstance): Promise<void> {
  // Criar servidor + ambiente inicial (transação).
  app.post("/servers", { preHandler: [app.authenticate] }, async (req) => {
    const body = ServerCreateSchema.parse(req.body);
    const a = body.ambiente;
    const server = await prisma.server.create({
      data: {
        ownerId: req.user.sub,
        name: body.name,
        ambientes: {
          create: {
            name: a.name,
            widthPx: a.wCells * CELL_SIZE,
            heightPx: a.hCells * CELL_SIZE,
            artPalette: a.palette,
            artIndices: Buffer.from(a.art, "base64"),
            collision: Buffer.from(a.collision, "base64"),
            spawnX: a.spawnX,
            spawnY: a.spawnY,
            chatRadius: a.chatRadius,
          },
        },
      },
      include: { ambientes: true },
    });
    return { id: server.id, ambienteId: server.ambientes[0]?.id };
  });

  // Listar servidores públicos (com presença e primeiro ambiente p/ preview).
  app.get("/servers", async () => {
    const servers = await prisma.server.findMany({
      where: { isPublic: true },
      orderBy: { createdAt: "desc" },
      include: {
        owner: { select: { displayName: true } },
        ambientes: { select: { id: true }, orderBy: { createdAt: "asc" } },
      },
    });
    const online = await onlineByAmbiente();
    const items: ServerListItem[] = servers.map((s) => ({
      id: s.id,
      name: s.name,
      ownerName: s.owner.displayName,
      ambienteCount: s.ambientes.length,
      playerCount: s.ambientes.reduce((sum, a) => sum + (online.get(a.id) ?? 0), 0),
      firstAmbienteId: s.ambientes[0]?.id ?? null,
      createdAt: s.createdAt.toISOString(),
    }));
    return { servers: items };
  });

  // Detalhe de um servidor (com metas dos ambientes).
  app.get<{ Params: { id: string } }>("/servers/:id", async (req, reply) => {
    const server = await prisma.server.findUnique({
      where: { id: req.params.id },
      include: { ambientes: true, owner: { select: { displayName: true } } },
    });
    if (!server) return reply.code(404).send({ error: "not_found" });
    return {
      id: server.id,
      name: server.name,
      ownerName: server.owner.displayName,
      ambientes: server.ambientes.map(metaDto),
    };
  });

  // Ambiente completo (arte + colisão) para carregar no jogo/editor.
  app.get<{ Params: { id: string } }>("/ambientes/:id", async (req, reply) => {
    const a = await prisma.ambiente.findUnique({ where: { id: req.params.id } });
    if (!a) return reply.code(404).send({ error: "not_found" });
    const full: AmbienteFullDto = {
      ...metaDto(a),
      palette: a.artPalette as string[],
      art: Buffer.from(a.artIndices).toString("base64"),
      collision: Buffer.from(a.collision).toString("base64"),
    };
    return { ambiente: full };
  });
}
