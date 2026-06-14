import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CELL_SIZE,
  DEFAULT_CHAT_RADIUS,
  DEFAULT_WORLD_H_CELLS,
  DEFAULT_WORLD_W_CELLS,
  MAX_CHAT_RADIUS,
  MAX_WORLD_CELLS,
  MIN_CHAT_RADIUS,
  MIN_WORLD_CELLS,
  bytesToBase64,
  packBitset,
} from "@talkhub/shared";
import { addAmbiente, createServer } from "./api";

type Mode = "art" | "collision" | "spawn" | "radius";
type Tool = "pencil" | "eraser" | "bucket";

const DEFAULT_PALETTE = ["#2b2b2b", "#ffffff", "#6abf69", "#4a90d9", "#d98b4a", "#c0504d"];

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

export function MapEditor({
  serverId,
  onSaved,
  onCancel,
}: {
  serverId?: string;
  onSaved: (serverId: string) => void;
  onCancel: () => void;
}) {
  const [serverName, setServerName] = useState("");
  const [ambienteName, setAmbienteName] = useState("Lobby");
  const [wCells, setWCells] = useState(DEFAULT_WORLD_W_CELLS);
  const [hCells, setHCells] = useState(DEFAULT_WORLD_H_CELLS);
  const [palette, setPalette] = useState<string[]>(DEFAULT_PALETTE);
  const [colorIdx, setColorIdx] = useState(0);
  const [mode, setMode] = useState<Mode>("art");
  const [tool, setTool] = useState<Tool>("pencil");
  const [chatRadius, setChatRadius] = useState(DEFAULT_CHAT_RADIUS);
  const [spawn, setSpawn] = useState({ x: 1, y: 1 });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const wpx = wCells * CELL_SIZE;
  const hpx = hCells * CELL_SIZE;
  const scale = Math.max(1, Math.min(8, Math.floor(768 / wpx)));

  // Buffers de arte (1 byte/pixel, 0=vazio) e colisão (1 byte/célula).
  const artRef = useRef<Uint8Array>(new Uint8Array(wpx * hpx));
  const collRef = useRef<Uint8Array>(new Uint8Array(wCells * hCells));
  const artCanvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const painting = useRef(false);
  const [, forceRender] = useState(0);
  const bump = () => forceRender((n) => n + 1);

  // Redimensiona buffers quando o tamanho muda.
  useEffect(() => {
    artRef.current = new Uint8Array(wpx * hpx);
    collRef.current = new Uint8Array(wCells * hCells);
    setSpawn({ x: Math.min(1, wCells - 1), y: Math.min(1, hCells - 1) });
    bump();
  }, [wpx, hpx, wCells, hCells]);

  const drawArt = useCallback(() => {
    const cv = artCanvas.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;
    const img = ctx.createImageData(wpx, hpx);
    const art = artRef.current;
    for (let i = 0; i < art.length; i++) {
      const v = art[i];
      const o = i * 4;
      if (v === 0) {
        img.data[o + 3] = 0;
      } else {
        const [r, g, b] = hexToRgb(palette[v - 1] ?? "#000000");
        img.data[o] = r;
        img.data[o + 1] = g;
        img.data[o + 2] = b;
        img.data[o + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [wpx, hpx, palette]);

  const drawOverlay = useCallback(() => {
    const cv = overlay.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;
    const cs = CELL_SIZE * scale;
    ctx.clearRect(0, 0, cv.width, cv.height);

    // grade de células
    ctx.strokeStyle = "rgba(0,0,0,0.08)";
    ctx.lineWidth = 1;
    for (let x = 0; x <= wCells; x++) {
      ctx.beginPath();
      ctx.moveTo(x * cs, 0);
      ctx.lineTo(x * cs, hCells * cs);
      ctx.stroke();
    }
    for (let y = 0; y <= hCells; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * cs);
      ctx.lineTo(wCells * cs, y * cs);
      ctx.stroke();
    }

    // colisão
    const coll = collRef.current;
    ctx.fillStyle = "rgba(220,40,40,0.4)";
    for (let i = 0; i < coll.length; i++) {
      if (coll[i]) ctx.fillRect((i % wCells) * cs, Math.floor(i / wCells) * cs, cs, cs);
    }

    // spawn
    ctx.fillStyle = "rgba(40,180,80,0.7)";
    ctx.fillRect(spawn.x * cs, spawn.y * cs, cs, cs);

    // raio (preview)
    if (mode === "radius") {
      ctx.beginPath();
      ctx.arc((spawn.x + 0.5) * cs, (spawn.y + 0.5) * cs, chatRadius * cs, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(40,110,240,0.9)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }, [scale, wCells, hCells, spawn, mode, chatRadius]);

  useEffect(() => {
    drawArt();
  }, [drawArt]);
  useEffect(() => {
    drawOverlay();
  });

  const floodFillArt = (px: number, py: number, value: number) => {
    const art = artRef.current;
    const start = py * wpx + px;
    const target = art[start];
    if (target === value) return;
    const stack = [start];
    while (stack.length) {
      const i = stack.pop()!;
      if (art[i] !== target) continue;
      art[i] = value;
      const x = i % wpx;
      const y = Math.floor(i / wpx);
      if (x > 0) stack.push(i - 1);
      if (x < wpx - 1) stack.push(i + 1);
      if (y > 0) stack.push(i - wpx);
      if (y < hpx - 1) stack.push(i + wpx);
    }
  };

  const applyAt = (clientX: number, clientY: number) => {
    const cv = overlay.current!;
    const rect = cv.getBoundingClientRect();
    const px = Math.floor((clientX - rect.left) / scale);
    const py = Math.floor((clientY - rect.top) / scale);
    if (px < 0 || py < 0 || px >= wpx || py >= hpx) return;
    const cellX = Math.floor(px / CELL_SIZE);
    const cellY = Math.floor(py / CELL_SIZE);

    if (mode === "art") {
      const art = artRef.current;
      if (tool === "bucket") floodFillArt(px, py, colorIdx + 1);
      else art[py * wpx + px] = tool === "eraser" ? 0 : colorIdx + 1;
      drawArt();
    } else if (mode === "collision") {
      collRef.current[cellY * wCells + cellX] = tool === "eraser" ? 0 : 1;
      drawOverlay();
    } else if (mode === "spawn") {
      setSpawn({ x: cellX, y: cellY });
    }
  };

  useEffect(() => {
    const up = () => (painting.current = false);
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);

  const save = async () => {
    if (!serverId && !serverName.trim()) {
      setMsg("Dê um nome ao servidor.");
      return;
    }
    setSaving(true);
    setMsg("");
    const ambiente = {
      name: ambienteName.trim() || "Lobby",
      wCells,
      hCells,
      palette,
      art: bytesToBase64(artRef.current),
      collision: bytesToBase64(packBitset(collRef.current, collRef.current.length)),
      spawnX: spawn.x,
      spawnY: spawn.y,
      chatRadius,
    };
    try {
      if (serverId) {
        await addAmbiente(serverId, ambiente);
        onSaved(serverId);
      } else {
        const res = await createServer({ name: serverName.trim(), ambiente });
        onSaved(res.id);
      }
    } catch {
      setMsg("Erro ao salvar (verifique os campos).");
    } finally {
      setSaving(false);
    }
  };

  const tools = useMemo<Tool[]>(
    () => (mode === "art" ? ["pencil", "eraser", "bucket"] : ["pencil", "eraser"]),
    [mode],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={onCancel}>← Voltar</button>
        {!serverId && (
          <input
            placeholder="Nome do servidor"
            value={serverName}
            onChange={(e) => setServerName(e.target.value)}
            style={{ padding: 6 }}
          />
        )}
        <input
          placeholder="Nome do ambiente"
          value={ambienteName}
          onChange={(e) => setAmbienteName(e.target.value)}
          style={{ padding: 6, width: 130 }}
        />
        <label>
          L:
          <input
            type="number"
            min={MIN_WORLD_CELLS}
            max={MAX_WORLD_CELLS}
            value={wCells}
            onChange={(e) => setWCells(clampCells(e.target.value))}
            style={{ width: 56 }}
          />
        </label>
        <label>
          A:
          <input
            type="number"
            min={MIN_WORLD_CELLS}
            max={MAX_WORLD_CELLS}
            value={hCells}
            onChange={(e) => setHCells(clampCells(e.target.value))}
            style={{ width: 56 }}
          />
        </label>
        <span style={{ fontSize: 12, color: "#777" }}>
          ({wpx}×{hpx}px)
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(["art", "collision", "spawn", "radius"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{ fontWeight: mode === m ? 700 : 400, background: mode === m ? "#e0ecff" : "#fff" }}
          >
            {m === "art" ? "Arte" : m === "collision" ? "Colisão" : m === "spawn" ? "Spawn" : "Raio"}
          </button>
        ))}
        {(mode === "art" || mode === "collision") &&
          tools.map((t) => (
            <button key={t} onClick={() => setTool(t)} style={{ fontWeight: tool === t ? 700 : 400 }}>
              {t === "pencil" ? "Lápis" : t === "eraser" ? "Borracha" : "Balde"}
            </button>
          ))}
      </div>

      {mode === "art" && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {palette.map((c, i) => (
            <button
              key={i}
              onClick={() => setColorIdx(i)}
              title={c}
              style={{
                width: 24,
                height: 24,
                background: c,
                border: colorIdx === i ? "3px solid #2563eb" : "1px solid #999",
              }}
            />
          ))}
          <input
            type="color"
            onChange={(e) => {
              setPalette((p) => [...p, e.target.value]);
              setColorIdx(palette.length);
            }}
            title="Adicionar cor"
          />
        </div>
      )}

      {mode === "radius" && (
        <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
          Raio: {chatRadius} células (≈ {chatRadius * CELL_SIZE}px)
          <input
            type="range"
            min={MIN_CHAT_RADIUS}
            max={MAX_CHAT_RADIUS}
            value={chatRadius}
            onChange={(e) => setChatRadius(Number(e.target.value))}
          />
        </label>
      )}

      <div style={{ position: "relative", width: wpx * scale, height: hpx * scale }}>
        <canvas
          ref={artCanvas}
          width={wpx}
          height={hpx}
          style={{
            position: "absolute",
            width: wpx * scale,
            height: hpx * scale,
            imageRendering: "pixelated",
            background:
              "repeating-conic-gradient(#eee 0% 25%, #fff 0% 50%) 50% / 16px 16px",
          }}
        />
        <canvas
          ref={overlay}
          width={wpx * scale}
          height={hpx * scale}
          style={{ position: "absolute", width: wpx * scale, height: hpx * scale, cursor: "crosshair" }}
          onPointerDown={(e) => {
            painting.current = true;
            applyAt(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (painting.current && mode !== "radius" && !(mode === "art" && tool === "bucket"))
              applyAt(e.clientX, e.clientY);
          }}
        />
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button
          onClick={save}
          disabled={saving}
          style={{ background: "#2563eb", color: "#fff", padding: "8px 14px", border: 0, borderRadius: 6 }}
        >
          {saving ? "Salvando…" : serverId ? "Adicionar ambiente" : "Salvar servidor"}
        </button>
        {msg && <span style={{ fontSize: 13, color: "#c0392b" }}>{msg}</span>}
      </div>
    </div>
  );
}

function clampCells(raw: string): number {
  const n = Math.round(Number(raw) || MIN_WORLD_CELLS);
  return Math.max(MIN_WORLD_CELLS, Math.min(MAX_WORLD_CELLS, n));
}
