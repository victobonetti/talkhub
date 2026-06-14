import { useEffect, useRef, useState } from "react";
import { Client, type Room } from "colyseus.js";
import {
  AVATAR_SIZE,
  CELL_SIZE,
  ROOM_AMBIENTE,
  base64ToBytes,
  unpackBits,
  type AmbienteFullDto,
  type AvatarPayload,
  type Dir,
} from "@talkhub/shared";
import { SERVER_WS_URL, getAmbiente, getToken } from "./api";

interface PlayerView {
  cellX: number;
  cellY: number;
  displayName: string;
}

const KEY_DIR: Record<string, Dir> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

/** Monta um canvas 16x16 com a silhueta do avatar pintada na cor do dono. */
function buildAvatarCanvas(av: AvatarPayload): HTMLCanvasElement {
  const px = unpackBits(base64ToBytes(av.bits));
  const cv = document.createElement("canvas");
  cv.width = AVATAR_SIZE;
  cv.height = AVATAR_SIZE;
  const ctx = cv.getContext("2d")!;
  const img = ctx.createImageData(AVATAR_SIZE, AVATAR_SIZE);
  const r = parseInt(av.color.slice(1, 3), 16);
  const g = parseInt(av.color.slice(3, 5), 16);
  const b = parseInt(av.color.slice(5, 7), 16);
  for (let i = 0; i < px.length; i++) {
    const o = i * 4;
    if (px[i]) {
      img.data[o] = r;
      img.data[o + 1] = g;
      img.data[o + 2] = b;
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

export function GameView({ ambienteId, onExit }: { ambienteId: string; onExit: () => void }) {
  const [status, setStatus] = useState("conectando…");
  const [meta, setMeta] = useState<AmbienteFullDto | null>(null);
  const mapCanvas = useRef<HTMLCanvasElement>(null);
  const playersCanvas = useRef<HTMLCanvasElement>(null);
  const roomRef = useRef<Room | null>(null);
  const avatarCache = useRef<Map<string, HTMLCanvasElement>>(new Map());
  const disp = useRef<Map<string, { x: number; y: number }>>(new Map());
  const seq = useRef(0);

  const wpx = meta ? meta.wCells * CELL_SIZE : 0;
  const hpx = meta ? meta.hCells * CELL_SIZE : 0;
  const scale = meta ? Math.max(1, Math.min(8, Math.floor(640 / wpx))) : 1;

  // Carrega o ambiente e conecta na sala.
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
      });
      room.onMessage("init", () => {});
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

  // Desenha o mapa (estático) quando o ambiente carrega.
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
        const hex = meta.palette[v - 1] ?? "#000000";
        img.data[o] = parseInt(hex.slice(1, 3), 16);
        img.data[o + 1] = parseInt(hex.slice(3, 5), 16);
        img.data[o + 2] = parseInt(hex.slice(5, 7), 16);
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [meta, wpx, hpx]);

  // Setas movimentam.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const dir = KEY_DIR[e.key];
      if (!dir) return;
      e.preventDefault();
      roomRef.current?.send("move", { dir, seq: seq.current++ });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Loop de render dos jogadores com interpolação.
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
        players.forEach((p: PlayerView, id: string) => {
          const tx = p.cellX * CELL_SIZE;
          const ty = p.cellY * CELL_SIZE;
          const d = disp.current.get(id) ?? { x: tx, y: ty };
          d.x += (tx - d.x) * 0.25;
          d.y += (ty - d.y) * 0.25;
          disp.current.set(id, d);
          const sprite = avatarCache.current.get(id);
          if (sprite) {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(sprite, d.x * scale, d.y * scale, CELL_SIZE * scale, CELL_SIZE * scale);
          } else {
            ctx.fillStyle = "#888";
            ctx.fillRect(d.x * scale, d.y * scale, CELL_SIZE * scale, CELL_SIZE * scale);
          }
          ctx.fillStyle = "#000";
          ctx.font = `${10}px sans-serif`;
          ctx.fillText(p.displayName, d.x * scale, d.y * scale - 2);
        });
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [meta, scale]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button onClick={onExit}>← Sair</button>
        <span style={{ fontSize: 13, color: "#666" }}>{status}</span>
        <span style={{ fontSize: 12, color: "#999" }}>(use as setas para andar)</span>
      </div>
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
    </div>
  );
}
