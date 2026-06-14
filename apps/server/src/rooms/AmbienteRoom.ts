import { Room, type Client } from "@colyseus/core";
import {
  AmbienteState,
  PlayerState,
  ChatMessageSchema,
  ClientMessage,
  MoveMessageSchema,
  ServerMessage,
  TICK_MS,
  CELL_SIZE,
  isBlocked,
  type AvatarPayload,
  type ChatPayload,
  type Dir,
  type InitPayload,
} from "@talkhub/shared";
import { prisma } from "../db.js";
import { verifySession, type SessionPayload } from "../session.js";

interface JoinOpts {
  ambienteId?: string;
  token?: string;
}

const DELTA: Record<Dir, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

/**
 * Sala autoritativa de um ambiente.
 * - Carrega colisão/meta do banco em onCreate.
 * - Valida movimento grid-based por tick (limites + colisão).
 * - Persiste a posição do jogador ao sair.
 * Chat por proximidade entra no M4 (aqui o relay é para toda a sala).
 */
export class AmbienteRoom extends Room<AmbienteState> {
  maxClients = 50;

  private ambienteId = "";
  private ambienteName = "";
  private wCells = 0;
  private hCells = 0;
  private collision: Uint8Array = new Uint8Array(0);
  private spawn = { x: 0, y: 0 };
  private chatRadius = 5;

  /** sessões -> dados de auth e avatar. */
  private sessions = new Map<string, SessionPayload>();
  private avatars = new Map<string, AvatarPayload>();
  /** última intenção de movimento pendente por sessão. */
  private intents = new Map<string, { dir: Dir; seq: number }>();

  async onCreate(options: JoinOpts): Promise<void> {
    const a = options.ambienteId
      ? await prisma.ambiente.findUnique({ where: { id: options.ambienteId } })
      : null;
    if (!a) throw new Error("ambiente_not_found");

    this.ambienteId = a.id;
    this.ambienteName = a.name;
    this.wCells = a.widthPx / CELL_SIZE;
    this.hCells = a.heightPx / CELL_SIZE;
    // bitset de colisão empacotado (1 bit/célula) — usado direto por isBlocked.
    this.collision = new Uint8Array(a.collision);
    this.spawn = { x: a.spawnX, y: a.spawnY };
    this.chatRadius = a.chatRadius;
    this.setMetadata({ ambienteId: a.id });

    this.setState(new AmbienteState());
    this.setSimulationInterval(() => this.tick(), TICK_MS);

    this.onMessage(ClientMessage.Move, (client, raw) => {
      const parsed = MoveMessageSchema.safeParse(raw);
      if (!parsed.success) return;
      this.intents.set(client.sessionId, parsed.data);
    });

    this.onMessage(ClientMessage.Chat, (client, raw) => {
      const parsed = ChatMessageSchema.safeParse(raw);
      if (!parsed.success) return;
      const sender = this.state.players.get(client.sessionId);
      if (!sender) return;
      // M4: filtrar por proximidade (raio = this.chatRadius).
      const payload: ChatPayload = {
        fromId: client.sessionId,
        displayName: sender.displayName,
        text: parsed.data.text,
        ts: Date.now(),
      };
      this.broadcast(ServerMessage.Chat, payload);
    });
  }

  async onJoin(client: Client, options: JoinOpts): Promise<void> {
    const session = verifySession(options.token);
    if (!session) throw new Error("unauthorized");
    this.sessions.set(client.sessionId, session);

    // posição salva ou spawn
    const saved = await prisma.playerPosition.findUnique({
      where: { userId_ambienteId: { userId: session.sub, ambienteId: this.ambienteId } },
    });
    const start =
      saved && this.inBounds(saved.cellX, saved.cellY) && !this.blocked(saved.cellX, saved.cellY)
        ? { x: saved.cellX, y: saved.cellY }
        : this.spawn;

    const player = new PlayerState();
    player.id = client.sessionId;
    player.userId = session.sub;
    player.displayName = session.name;
    player.cellX = start.x;
    player.cellY = start.y;
    this.state.players.set(client.sessionId, player);

    // avatar do jogador (se houver) -> distribui aos demais e os existentes a ele
    const av = await prisma.avatar.findUnique({ where: { userId: session.sub } });
    if (av) {
      const payload: AvatarPayload = {
        id: client.sessionId,
        userId: session.sub,
        displayName: session.name,
        bits: Buffer.from(av.bits).toString("base64"),
        color: av.color,
      };
      this.avatars.set(client.sessionId, payload);
      this.broadcast(ServerMessage.Avatar, payload);
    }
    for (const existing of this.avatars.values()) {
      if (existing.id !== client.sessionId) client.send(ServerMessage.Avatar, existing);
    }

    const init: InitPayload = {
      you: client.sessionId,
      ambiente: {
        id: this.ambienteId,
        name: this.ambienteName,
        widthPx: this.wCells * CELL_SIZE,
        heightPx: this.hCells * CELL_SIZE,
        spawnX: this.spawn.x,
        spawnY: this.spawn.y,
        chatRadius: this.chatRadius,
      },
    };
    client.send(ServerMessage.Init, init);
  }

  async onLeave(client: Client): Promise<void> {
    const player = this.state.players.get(client.sessionId);
    const session = this.sessions.get(client.sessionId);
    if (player && session) {
      await prisma.playerPosition
        .upsert({
          where: { userId_ambienteId: { userId: session.sub, ambienteId: this.ambienteId } },
          create: {
            userId: session.sub,
            ambienteId: this.ambienteId,
            cellX: player.cellX,
            cellY: player.cellY,
          },
          update: { cellX: player.cellX, cellY: player.cellY },
        })
        .catch(() => {});
    }
    this.state.players.delete(client.sessionId);
    this.sessions.delete(client.sessionId);
    this.avatars.delete(client.sessionId);
    this.intents.delete(client.sessionId);
  }

  private inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.wCells && y < this.hCells;
  }
  private blocked(x: number, y: number): boolean {
    return isBlocked(this.collision, x, y, this.wCells);
  }

  private tick(): void {
    for (const [sessionId, intent] of this.intents) {
      const player = this.state.players.get(sessionId);
      if (!player) continue;
      player.dir = intent.dir;
      const [dx, dy] = DELTA[intent.dir];
      const tx = player.cellX + dx;
      const ty = player.cellY + dy;
      if (this.inBounds(tx, ty) && !this.blocked(tx, ty)) {
        player.cellX = tx;
        player.cellY = ty;
      } else {
        const client = this.clients.find((c) => c.sessionId === sessionId);
        client?.send(ServerMessage.Correction, {
          cellX: player.cellX,
          cellY: player.cellY,
          seq: intent.seq,
        });
      }
    }
    this.intents.clear();
  }
}
