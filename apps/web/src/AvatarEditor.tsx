import { useCallback, useEffect, useRef, useState } from "react";
import {
  AVATAR_SIZE,
  AVATAR_PIXELS,
  base64ToBytes,
  bytesToBase64,
  packBits,
  randomAvatarPixels,
  randomColor,
  unpackBits,
} from "@talkhub/shared";
import { getAvatar, putAvatar } from "./api";
import { PixelButton, PixelPanel, PixelBadge } from "./ui";

type Tool = "pencil" | "eraser" | "bucket";

const CELL = 22;

const TOOL_LABEL: Record<Tool, string> = {
  pencil: "Lápis",
  eraser: "Borracha",
  bucket: "Balde",
};

export function AvatarEditor() {
  const [pixels, setPixels] = useState<Uint8Array>(() => randomAvatarPixels());
  const [color, setColor] = useState<string>(() => randomColor());
  const [tool, setTool] = useState<Tool>("pencil");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string>("");
  const painting = useRef(false);

  // Carrega avatar salvo, se houver.
  useEffect(() => {
    let active = true;
    getAvatar()
      .then((av) => {
        if (active && av) {
          setPixels(unpackBits(base64ToBytes(av.bits)));
          setColor(av.color);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Soltar o mouse em qualquer lugar encerra a pintura.
  useEffect(() => {
    const up = () => (painting.current = false);
    window.addEventListener("pointerup", up);
    return () => window.removeEventListener("pointerup", up);
  }, []);

  const setPixel = useCallback((index: number, value: number) => {
    setPixels((prev) => {
      if (prev[index] === value) return prev;
      const next = prev.slice();
      next[index] = value;
      return next;
    });
  }, []);

  const floodFill = useCallback((start: number) => {
    setPixels((prev) => {
      const target = prev[start];
      const fill = target ? 0 : 1;
      const next = prev.slice();
      const stack = [start];
      while (stack.length) {
        const i = stack.pop()!;
        if (next[i] !== target) continue;
        next[i] = fill;
        const x = i % AVATAR_SIZE;
        const y = Math.floor(i / AVATAR_SIZE);
        if (x > 0) stack.push(i - 1);
        if (x < AVATAR_SIZE - 1) stack.push(i + 1);
        if (y > 0) stack.push(i - AVATAR_SIZE);
        if (y < AVATAR_SIZE - 1) stack.push(i + AVATAR_SIZE);
      }
      return next;
    });
  }, []);

  const applyAt = useCallback(
    (index: number) => {
      if (tool === "pencil") setPixel(index, 1);
      else if (tool === "eraser") setPixel(index, 0);
      else floodFill(index);
    },
    [tool, setPixel, floodFill],
  );

  const onDown = (index: number) => {
    painting.current = true;
    applyAt(index);
  };
  const onEnter = (index: number) => {
    if (painting.current && tool !== "bucket") applyAt(index);
  };

  const save = async () => {
    setSaving(true);
    setMsg("");
    try {
      await putAvatar(bytesToBase64(packBits(pixels)), color);
      setMsg("Avatar salvo!");
    } catch {
      setMsg("Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const saved = msg === "Avatar salvo!";

  return (
    <div style={{ display: "flex", gap: "var(--sp-5)", flexWrap: "wrap" }}>
      <PixelPanel tone="inset" style={{ padding: "var(--sp-3)", alignSelf: "flex-start" }}>
        <div
          aria-label="Editor de avatar 16 por 16"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${AVATAR_SIZE}, ${CELL}px)`,
            gridTemplateRows: `repeat(${AVATAR_SIZE}, ${CELL}px)`,
            border: "var(--bw) solid var(--c-border)",
            touchAction: "none",
            userSelect: "none",
          }}
        >
          {Array.from({ length: AVATAR_PIXELS }, (_, i) => (
            <div
              key={i}
              onPointerDown={() => onDown(i)}
              onPointerEnter={() => onEnter(i)}
              style={{
                width: CELL,
                height: CELL,
                background: pixels[i] ? color : "var(--c-ink)",
                boxShadow: "inset 0 0 0 1px rgba(18,12,34,0.22)",
                cursor: "crosshair",
              }}
            />
          ))}
        </div>
      </PixelPanel>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)", minWidth: 220 }}>
        <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap" }}>
          {(["pencil", "eraser", "bucket"] as Tool[]).map((t) => (
            <PixelButton
              key={t}
              size="sm"
              variant={tool === t ? "primary" : "default"}
              aria-pressed={tool === t}
              onClick={() => setTool(t)}
            >
              {TOOL_LABEL[t]}
            </PixelButton>
          ))}
        </div>

        <PixelPanel tone="raised" title="Cor">
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--sp-2)",
              fontFamily: "var(--font-display)",
              fontSize: "var(--fs-d-sm)",
            }}
          >
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              style={{
                width: 44,
                height: 44,
                padding: 0,
                border: "var(--bw) solid var(--c-border)",
                background: "var(--c-panel-inset)",
                cursor: "pointer",
              }}
            />
            <span>{color.toUpperCase()}</span>
          </label>
        </PixelPanel>

        <PixelButton variant="default" onClick={() => setPixels(randomAvatarPixels())}>
          Gerar aleatório
        </PixelButton>
        <PixelButton variant="default" onClick={() => setPixels(new Uint8Array(AVATAR_PIXELS))}>
          Limpar
        </PixelButton>

        <PixelButton variant="primary" onClick={save} disabled={saving}>
          {saving ? "Salvando..." : "Salvar avatar"}
        </PixelButton>
        {msg && (
          <PixelBadge tone={saved ? "online" : "warn"}>
            {saved ? "Avatar salvo!" : "Não deu para salvar — tente de novo."}
          </PixelBadge>
        )}
      </div>
    </div>
  );
}
