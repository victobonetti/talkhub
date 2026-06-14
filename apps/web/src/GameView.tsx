import { useEffect, useRef, useState } from "react";
import { Client, type Room } from "colyseus.js";
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
    fontSize: 22,
    borderRadius: 8,
    border: "1px solid #bbb",
    background: "#fff",
    touchAction: "none",
  };
  const press = (dir: Dir) => (e: React.PointerEvent) => {
    e.preventDefault();
    onMove(dir);
  };
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 52px)", gap: 6, justifyContent: "center", marginTop: 8 }}>
      <span />
      <button style={btn} onPointerDown={press("up")}>↑</button>
      <span />
      <button style={btn} onPointerDown={press("left")}>←</button>
      <button style={btn} onPointerDown={press("down")}>↓</button>
      <button style={btn} onPointerDown={press("right")}>→</button>
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
        style={{ display: "inline-block", width: size, height: size, background: "#bbb", borderRadius: 3 }}
      />
    );
  return (
    <canvas
      ref={ref}
      width={AVATAR_SIZE}
      height={AVATAR_SIZE}
      style={{ width: size, height: size, imageRendering: "pixelated", verticalAlign: "middle" }}
    />
  );
}

export function GameView({ ambienteId, onExit }: { ambienteId: string; onExit: () => void }) {
  const [status, setStatus] = useState("conectando…");
  const [meta, setMeta] = useState<AmbienteFullDto | null>(null);
  const [avatars, setAvatars] = useState<Map<string, AvatarPayload>>(new Map());
  const [messages, setMessages] = useState<ChatLine[]>([]);
  const [nearby, setNearby] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [myId, setMyId] = useState("");
  const [vw, setVw] = useState(() => window.innerWidth);

  const mapCanvas = useRef<HTMLCanvasElement>(null);
  const playersCanvas = useRef<HTMLCanvasElement>(null);
  const roomRef = useRef<Room | null>(null);
  const avatarCache = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const disp = useRef<Map<string, { x: number; y: number }>>(new Map());
  const bubbles = useRef<Map<string, { text: string; until: number }>>(new Map());
  const seq = useRef(0);
  const msgKey = useRef(0);

  const isMobile = vw < 768;
  const wpx = meta ? meta.wCells * CELL_SIZE : 0;
  const hpx = meta ? meta.hCells * CELL_SIZE : 0;
  const maxW = isMobile ? vw - 32 : 560;
  const scale = meta ? Math.max(1, Math.min(8, Math.floor(maxW / wpx))) : 1;

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
      room = await client.joinOrCreate(ROOM_AMBIENTE, { ambienteId, token: getToken() });
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
    })().catch((e: unknown) => {
      if (active) setStatus(`erro: ${e instanceof Error ? e.message : String(e)}`);
    });
    return () => {
      active = false;
      void room?.leave();
      roomRef.current = null;
    };
  }, [ambienteId]);

  // Mapa estático.
  useEffect(() => {
    if (!meta || !mapCanvas.current) return;
    const ctx = mapCanvas.current.getContext("2d")!;
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

  // Render dos jogadores com interpolação.
  useEffect(() => {
    if (!meta) return;
    let raf = 0;
    const draw = () => {
      const cv = playersCanvas.current;
      const room = roomRef.current;
      if (cv && room) {
        const ctx = cv.getContext("2d")!;
        ctx.clearRect(0, 0, cv.width, cv.height);
        const players = room.state.players as Map<string, PlayerView>;
        const now = Date.now();

        // destaque do meu raio de chat (sob os jogadores)
        const mine = myId ? disp.current.get(myId) : undefined;
        if (mine && meta) {
          ctx.beginPath();
          ctx.arc(
            (mine.x + CELL_SIZE / 2) * scale,
            (mine.y + CELL_SIZE / 2) * scale,
            meta.chatRadius * CELL_SIZE * scale,
            0,
            Math.PI * 2,
          );
          ctx.fillStyle = "rgba(40,110,240,0.06)";
          ctx.fill();
          ctx.strokeStyle = "rgba(40,110,240,0.25)";
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        players.forEach((p: PlayerView, id: string) => {
          const tx = p.cellX * CELL_SIZE;
          const ty = p.cellY * CELL_SIZE;
          const d = disp.current.get(id) ?? { x: tx, y: ty };
          d.x += (tx - d.x) * 0.25;
          d.y += (ty - d.y) * 0.25;
          disp.current.set(id, d);
          const sprite = avatarCache.current.get(id);
          ctx.imageSmoothingEnabled = false;
          if (sprite) {
            ctx.drawImage(sprite, d.x * scale, d.y * scale, CELL_SIZE * scale, CELL_SIZE * scale);
          } else {
            ctx.fillStyle = "#888";
            ctx.fillRect(d.x * scale, d.y * scale, CELL_SIZE * scale, CELL_SIZE * scale);
          }
          ctx.fillStyle = "#000";
          ctx.font = "10px sans-serif";
          ctx.fillText(p.displayName, d.x * scale, d.y * scale - 2);

          // balão de fala (acima do avatar)
          const bubble = bubbles.current.get(id);
          if (bubble && bubble.until > now) {
            const text = bubble.text.length > 40 ? bubble.text.slice(0, 39) + "…" : bubble.text;
            ctx.font = "11px sans-serif";
            const w = ctx.measureText(text).width + 10;
            const cx = d.x * scale + (CELL_SIZE * scale) / 2;
            const bx = Math.max(0, cx - w / 2);
            const by = d.y * scale - 20;
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
  }, [meta, scale, myId]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    roomRef.current?.send("chat", { text });
    setDraft("");
  };

  const extra = nearby.length - MAX_LISTENERS_SHOWN;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button onClick={onExit}>← Sair</button>
        <span style={{ fontSize: 13, color: "#666" }}>{status}</span>
        <span style={{ fontSize: 12, color: "#999" }}>setas = andar · digite e Enter = falar</span>
      </div>

      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "flex-start",
          flexDirection: isMobile ? "column" : "row",
        }}
      >
        {/* Mapa + barra de ouvintes */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ position: "relative", width: wpx * scale, height: hpx * scale }}>
            <canvas
              ref={mapCanvas}
              width={wpx}
              height={hpx}
              style={{
                position: "absolute",
                width: wpx * scale,
                height: hpx * scale,
                imageRendering: "pixelated",
                border: "1px solid #ccc",
              }}
            />
            <canvas
              ref={playersCanvas}
              width={wpx * scale}
              height={hpx * scale}
              style={{ position: "absolute", width: wpx * scale, height: hpx * scale }}
            />
          </div>
          <div style={{ display: "flex", gap: 4, alignItems: "center", minHeight: 26 }}>
            <span style={{ fontSize: 12, color: "#777", marginRight: 4 }}>Ouvindo:</span>
            {nearby.length === 0 && <span style={{ fontSize: 12, color: "#aaa" }}>ninguém por perto</span>}
            {nearby.slice(0, MAX_LISTENERS_SHOWN).map((id) => (
              <AvatarThumb key={id} payload={avatars.get(id)} size={22} />
            ))}
            {extra > 0 && <span style={{ fontSize: 13, fontWeight: 700 }}>+{extra}</span>}
          </div>
          {isMobile && <DPad onMove={sendMove} />}
        </div>

        {/* Chat */}
        <div
          style={{
            flex: 1,
            minWidth: 260,
            alignSelf: "stretch",
            display: "flex",
            flexDirection: "column",
            height: isMobile ? 280 : hpx * scale,
          }}
        >
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              border: "1px solid #ddd",
              borderRadius: 6,
              padding: 8,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {messages.map((m) => (
              <div key={m.key} style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
                <AvatarThumb payload={avatars.get(m.fromId)} size={20} />
                <div style={{ fontSize: 13 }}>
                  <strong>{m.displayName}:</strong> {m.text}
                </div>
              </div>
            ))}
          </div>
          <input
            autoFocus
            value={draft}
            placeholder="Mensagem (só quem está no seu raio recebe)"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                send();
              }
            }}
            style={{ marginTop: 6, padding: 8 }}
          />
        </div>
      </div>
    </div>
  );
}
