import { useEffect, useRef, useState } from "react";
import { Client, type Room } from "colyseus.js";
import {
  PixelButton,
  PixelBadge,
  PixelPanel,
  PixelInput,
  type PixelBadgeTone,
} from "./ui";
import {
  AVATAR_SIZE,
  CELL_SIZE,
  MAX_LISTENERS_SHOWN,
  ROOM_AMBIENTE,
  base64ToBytes,
  unpackBits,
  type AmbienteFullDto,
  type AvatarPayload,
  type ChatPayload,
  type Dir,
} from "@talkhub/shared";
import { SERVER_WS_URL, getAmbiente, getToken } from "./api";

interface PlayerView {
  cellX: number;
  cellY: number;
  displayName: string;
}

interface ChatLine extends ChatPayload {
  key: number;
}

const KEY_DIR: Record<string, Dir> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

function rgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

/** Pinta a silhueta de um avatar num canvas 16x16. */
function drawAvatar(ctx: CanvasRenderingContext2D, av: AvatarPayload): void {
  const px = unpackBits(base64ToBytes(av.bits));
  const img = ctx.createImageData(AVATAR_SIZE, AVATAR_SIZE);
  const [r, g, b] = rgb(av.color);
  for (let i = 0; i < px.length; i++) {
    if (px[i]) {
      const o = i * 4;
      img.data[o] = r;
      img.data[o + 1] = g;
      img.data[o + 2] = b;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function buildAvatarCanvas(av: AvatarPayload): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = AVATAR_SIZE;
  cv.height = AVATAR_SIZE;
  drawAvatar(cv.getContext("2d")!, av);
  return cv;
}

/** Controle direcional na tela (mobile). */
function DPad({ onMove }: { onMove: (dir: Dir) => void }) {
  const btn: React.CSSProperties = {
    width: 52,
    height: 52,
    minWidth: 52,
    fontSize: 22,
    touchAction: "none",
  };
  const press = (dir: Dir) => (e: React.PointerEvent) => {
    e.preventDefault();
    onMove(dir);
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 52px)", gap: "var(--sp-1)", justifyContent: "center", marginTop: "var(--sp-2)" }}>
      <span />
      <button type="button" className="px-btn px-btn--default px-iconbtn" style={btn} onPointerDown={press("up")}>↑</button>
      <span />
      <button type="button" className="px-btn px-btn--default px-iconbtn" style={btn} onPointerDown={press("left")}>←</button>
      <button type="button" className="px-btn px-btn--default px-iconbtn" style={btn} onPointerDown={press("down")}>↓</button>
      <button type="button" className="px-btn px-btn--default px-iconbtn" style={btn} onPointerDown={press("right")}>→</button>
    </div>
  );
}

function AvatarThumb({ payload, size = 22 }: { payload?: AvatarPayload; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current && payload) drawAvatar(ref.current.getContext("2d")!, payload);
  }, [payload]);
  if (!payload)
    return (
      <span
        style={{
          display: "inline-block",
          width: size,
          height: size,
          background: "var(--c-muted)",
          border: "var(--bw-thin) solid var(--c-border)",
          verticalAlign: "middle",
        }}
      />
    );
  return (
    <canvas
      ref={ref}
      width={AVATAR_SIZE}
      height={AVATAR_SIZE}
      style={{
        width: size,
        height: size,
        imageRendering: "pixelated",
        verticalAlign: "middle",
        border: "var(--bw-thin) solid var(--c-border)",
      }}
    />
  );
}

export function GameView({
  ambienteId,
  initialSpawn,
  onExit,
  onPortal,
}: {
  ambienteId: string;
  initialSpawn?: { x: number; y: number };
  onExit: () => void;
  onPortal: (targetAmbienteId: string, spawn: { x: number; y: number }) => void;
}) {
  const [status, setStatus] = useState("conectando…");
  const [meta, setMeta] = useState<AmbienteFullDto | null>(null);
  const [avatars, setAvatars] = useState<Map<string, AvatarPayload>>(new Map());
  const [messages, setMessages] = useState<ChatLine[]>([]);
  const [nearby, setNearby] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [myId, setMyId] = useState("");
  const [vw, setVw] = useState(() => window.innerWidth);

  const playersCanvas = useRef<HTMLCanvasElement>(null);
  const mapBuffer = useRef<HTMLCanvasElement | null>(null);
  const roomRef = useRef<Room | null>(null);
  const avatarCache = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const disp = useRef<Map<string, { x: number; y: number }>>(new Map());
  const bubbles = useRef<Map<string, { text: string; until: number }>>(new Map());
  const seq = useRef(0);
  const msgKey = useRef(0);

  const isMobile = vw < 768;
  const wpx = meta ? meta.wCells * CELL_SIZE : 0;
  const hpx = meta ? meta.hCells * CELL_SIZE : 0;
  // Campo de visão = a área do "raio" ao redor do player (em células), limitada
  // ao tamanho do mapa. A câmera segue o player — ele NÃO vê o mapa inteiro.
  const viewWCells = meta ? Math.min(meta.wCells, meta.chatRadius * 2 + 1) : 0;
  const viewHCells = meta ? Math.min(meta.hCells, meta.chatRadius * 2 + 1) : 0;
  const vpW = viewWCells * CELL_SIZE;
  const vpH = viewHCells * CELL_SIZE;
  const maxW = isMobile ? vw - 32 : 560;
  const scale = meta && vpW > 0 ? Math.max(1, Math.min(16, Math.floor(maxW / vpW))) : 1;

  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const sendMove = (dir: Dir) => roomRef.current?.send("move", { dir, seq: seq.current++ });

  useEffect(() => {
    let active = true;
    let room: Room | null = null;
    (async () => {
      const full = await getAmbiente(ambienteId);
      if (!active) return;
      setMeta(full);
      const client = new Client(SERVER_WS_URL);
      room = await client.joinOrCreate(ROOM_AMBIENTE, {
        ambienteId,
        token: getToken(),
        spawnX: initialSpawn?.x,
        spawnY: initialSpawn?.y,
      });
      if (!active) {
        void room.leave();
        return;
      }
      roomRef.current = room;
      setStatus("conectado");
      room.onMessage("avatar", (av: AvatarPayload) => {
        avatarCache.current.set(av.id, buildAvatarCanvas(av));
        setAvatars((prev) => new Map(prev).set(av.id, av));
      });
      room.onMessage("chat", (m: ChatPayload) => {
        setMessages((prev) => [...prev.slice(-49), { ...m, key: msgKey.current++ }]);
        bubbles.current.set(m.fromId, { text: m.text, until: Date.now() + 4000 });
      });
      room.onMessage("nearby", (m: { ids: string[] }) => setNearby(m.ids));
      room.onMessage("init", (m: { you: string }) => setMyId(m.you));
      room.onMessage("correction", () => {});
      room.onMessage(
        "portal",
        (m: { targetAmbienteId: string; spawnX: number; spawnY: number }) => {
          onPortal(m.targetAmbienteId, { x: m.spawnX, y: m.spawnY });
        },
      );
    })().catch((e: unknown) => {
      if (active) setStatus(`erro: ${e instanceof Error ? e.message : String(e)}`);
    });
    return () => {
      active = false;
      void room?.leave();
      roomRef.current = null;
    };
  }, [ambienteId]);

  // Mapa renderizado uma vez num buffer offscreen; a câmera recorta a fatia
  // visível a cada frame (e amplia conforme o zoom).
  useEffect(() => {
    if (!meta) return;
    const buf = document.createElement("canvas");
    buf.width = wpx;
    buf.height = hpx;
    const ctx = buf.getContext("2d")!;
    const indices = base64ToBytes(meta.art);
    const img = ctx.createImageData(wpx, hpx);
    for (let i = 0; i < indices.length; i++) {
      const v = indices[i];
      const o = i * 4;
      if (v === 0) {
        img.data[o] = 245;
        img.data[o + 1] = 245;
        img.data[o + 2] = 245;
        img.data[o + 3] = 255;
      } else {
        const [r, g, b] = rgb(meta.palette[v - 1] ?? "#000000");
        img.data[o] = r;
        img.data[o + 1] = g;
        img.data[o + 2] = b;
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    mapBuffer.current = buf;
  }, [meta, wpx, hpx]);

  // Teclado: setas movem (sempre), Enter envia o chat, demais teclas digitam.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const dir = KEY_DIR[e.key];
      if (dir) {
        e.preventDefault();
        sendMove(dir);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Render: câmera com zoom seguindo o player; recorta a fatia visível do mapa.
  useEffect(() => {
    if (!meta) return;
    let raf = 0;
    const draw = () => {
      const cv = playersCanvas.current;
      const room = roomRef.current;
      if (cv && room) {
        const ctx = cv.getContext("2d")!;
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, cv.width, cv.height);
        const players = room.state.players as Map<string, PlayerView>;
        const now = Date.now();

        // Câmera centrada no player (posição interpolada), presa às bordas do mapa.
        const mine = myId ? disp.current.get(myId) : undefined;
        const camCX = mine ? mine.x + CELL_SIZE / 2 : wpx / 2;
        const camCY = mine ? mine.y + CELL_SIZE / 2 : hpx / 2;
        const camX = Math.floor(Math.max(0, Math.min(wpx - vpW, camCX - vpW / 2)));
        const camY = Math.floor(Math.max(0, Math.min(hpx - vpH, camCY - vpH / 2)));

        // Fundo: fatia visível do mapa, ampliada pelo zoom.
        const buf = mapBuffer.current;
        if (buf) {
          ctx.drawImage(buf, camX, camY, vpW, vpH, 0, 0, vpW * scale, vpH * scale);
        }

        const cell = CELL_SIZE * scale;
        players.forEach((p: PlayerView, id: string) => {
          const tx = p.cellX * CELL_SIZE;
          const ty = p.cellY * CELL_SIZE;
          const d = disp.current.get(id) ?? { x: tx, y: ty };
          d.x += (tx - d.x) * 0.25;
          d.y += (ty - d.y) * 0.25;
          disp.current.set(id, d);

          // Converte mundo -> tela aplicando a câmera.
          const sx = (d.x - camX) * scale;
          const sy = (d.y - camY) * scale;
          if (sx + cell < 0 || sy + cell < 0 || sx > cv.width || sy > cv.height) return;

          const sprite = avatarCache.current.get(id);
          if (sprite) {
            ctx.drawImage(sprite, sx, sy, cell, cell);
          } else {
            ctx.fillStyle = "#888";
            ctx.fillRect(sx, sy, cell, cell);
          }
          ctx.fillStyle = "#000";
          ctx.font = "10px sans-serif";
          ctx.fillText(p.displayName, sx, sy - 2);

          // balão de fala (acima do avatar)
          const bubble = bubbles.current.get(id);
          if (bubble && bubble.until > now) {
            const text = bubble.text.length > 40 ? bubble.text.slice(0, 39) + "…" : bubble.text;
            ctx.font = "11px sans-serif";
            const w = ctx.measureText(text).width + 10;
            const cx = sx + cell / 2;
            const bx = Math.max(0, cx - w / 2);
            const by = sy - 20;
            ctx.fillStyle = "rgba(255,255,255,0.95)";
            ctx.strokeStyle = "#bbb";
            ctx.lineWidth = 1;
            ctx.fillRect(bx, by, w, 16);
            ctx.strokeRect(bx, by, w, 16);
            ctx.fillStyle = "#000";
            ctx.fillText(text, bx + 5, by + 12);
          }
        });
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [meta, scale, myId, vpW, vpH, wpx, hpx]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    roomRef.current?.send("chat", { text });
    setDraft("");
  };

  const extra = nearby.length - MAX_LISTENERS_SHOWN;

  const statusTone: PixelBadgeTone = status.startsWith("erro:")
    ? "warn"
    : status === "conectado"
      ? "online"
      : "info";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
      <PixelPanel
        tone="raised"
        style={{
          display: "flex",
          gap: "var(--sp-3)",
          alignItems: "center",
          flexWrap: "wrap",
          padding: "var(--sp-2) var(--sp-3)",
        }}
      >
        <PixelButton variant="ghost" size="sm" onClick={onExit}>
          ← Sair
        </PixelButton>
        <PixelBadge tone={statusTone}>{status}</PixelBadge>
        <span
          style={{
            fontFamily: "var(--font-body)",
            fontSize: "var(--fs-sm)",
            color: "var(--c-ink-dim)",
          }}
        >
          {isMobile ? "toque no D-pad · Enter = falar" : "setas = andar · digite e Enter = falar"}
        </span>
      </PixelPanel>

      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "flex-start",
          flexDirection: isMobile ? "column" : "row",
        }}
      >
        {/* Mapa + barra de ouvintes */}
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
          <PixelPanel
            tone="inset"
            style={{ padding: 0, lineHeight: 0, width: "fit-content" }}
          >
            <canvas
              ref={playersCanvas}
              width={vpW * scale}
              height={vpH * scale}
              style={{
                display: "block",
                width: vpW * scale,
                height: vpH * scale,
                imageRendering: "pixelated",
                border: "var(--bw) solid var(--c-border)",
              }}
            />
          </PixelPanel>
          <div
            className="px-toolbar"
            style={{
              minHeight: 44,
              gap: "var(--sp-2)",
              background: "var(--c-panel-inset)",
              border: "var(--bw-thin) solid var(--c-border)",
              padding: "var(--sp-1) var(--sp-2)",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "var(--fs-d-sm)",
                color: "var(--c-ink-dim)",
                marginRight: "var(--sp-1)",
              }}
            >
              Ouvindo:
            </span>
            {nearby.length === 0 && <PixelBadge tone="muted">ninguém por perto</PixelBadge>}
            {nearby.slice(0, MAX_LISTENERS_SHOWN).map((id) => (
              <AvatarThumb key={id} payload={avatars.get(id)} size={22} />
            ))}
            {extra > 0 && <PixelBadge tone="info">+{extra}</PixelBadge>}
          </div>
          {isMobile && <DPad onMove={sendMove} />}
        </div>

        {/* Chat */}
        <PixelPanel
          tone="raised"
          style={{
            flex: 1,
            minWidth: 260,
            alignSelf: "stretch",
            display: "flex",
            flexDirection: "column",
            height: isMobile ? 280 : vpH * scale,
            padding: "var(--sp-2)",
          }}
        >
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              background: "var(--c-panel-inset)",
              border: "var(--bw-thin) solid var(--c-border)",
              boxShadow: "inset 0 var(--bw-thin) 0 0 rgba(0,0,0,0.4)",
              padding: "var(--sp-2)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--sp-2)",
            }}
          >
            {messages.length === 0 && (
              <span
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: "var(--fs-sm)",
                  color: "var(--c-ink-dim)",
                }}
              >
                Ninguém falou ainda. Chegue perto de alguém e diga oi!
              </span>
            )}
            {messages.map((m) => (
              <div key={m.key} style={{ display: "flex", gap: "var(--sp-2)", alignItems: "flex-start" }}>
                <AvatarThumb payload={avatars.get(m.fromId)} size={20} />
                <div style={{ fontFamily: "var(--font-body)", fontSize: "var(--fs-sm)", color: "var(--c-ink)" }}>
                  <strong
                    style={{
                      fontFamily: "var(--font-display)",
                      fontSize: "var(--fs-d-sm)",
                      color: "var(--c-primary)",
                      marginRight: "var(--sp-1)",
                    }}
                  >
                    {m.displayName}:
                  </strong>
                  {m.text}
                </div>
              </div>
            ))}
          </div>
          <PixelInput
            autoFocus
            value={draft}
            placeholder="Fala algo… (quem está por perto ouve)"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                send();
              }
            }}
            style={{ marginTop: "var(--sp-2)" }}
          />
        </PixelPanel>
      </div>
    </div>
  );
}
