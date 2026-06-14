import { Room, type Client } from "@colyseus/core";
import {
  AmbienteState,
  PlayerState,
  ChatMessageSchema,
  ClientMessage,
  JoinOptionsSchema,
  MoveMessageSchema,
  ServerMessage,
  TICK_MS,
  type ChatPayload,
  type JoinOptions,
} from "@talkhub/shared";

/**
 * Sala autoritativa de um ambiente.
 *
 * M0: estrutura mínima — join/leave, validação de mensagens e relay de chat
 * para toda a sala. A lógica real entra nos próximos milestones:
 *  - M3: validação de movimento (adjacência/limites/colisão) por tick.
 *  - M4: filtro de chat por proximidade + cálculo de `nearby`.
 */
export class AmbienteRoom extends Room<AmbienteState> {
  maxClients = 50;

  onCreate(): void {
    this.setState(new AmbienteState());
    this.setSimulationInterval(() => this.tick(), TICK_MS);

    this.onMessage(ClientMessage.Move, (client, raw) => {
      const parsed = MoveMessageSchema.safeParse(raw);
      if (!parsed.success) return;
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      // M3: validar destino contra colisão/limites antes de aplicar.
      player.dir = parsed.data.dir;
    });

    this.onMessage(ClientMessage.Chat, (client, raw) => {
      const parsed = ChatMessageSchema.safeParse(raw);
      if (!parsed.success) return;
      const sender = this.state.players.get(client.sessionId);
      if (!sender) return;
      // M4: relayar apenas para jogadores dentro do raio do remetente.
      const payload: ChatPayload = {
        fromId: client.sessionId,
        displayName: sender.displayName,
        text: parsed.data.text,
        ts: Date.now(),
      };
      this.broadcast(ServerMessage.Chat, payload);
    });
  }

  onJoin(client: Client, options?: unknown): void {
    const opts: JoinOptions = JoinOptionsSchema.parse(options ?? {});
    const player = new PlayerState();
    player.id = client.sessionId;
    player.userId = client.sessionId; // M1: substituir pelo userId autenticado.
    player.displayName = opts.displayName ?? `guest-${client.sessionId.slice(0, 4)}`;
    player.cellX = 0;
    player.cellY = 0;
    this.state.players.set(client.sessionId, player);
  }

  onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
  }

  private tick(): void {
    // M3/M4: resolver fila de movimento e recalcular `nearby` por jogador.
  }
}
