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

type Tool = "pencil" | "eraser" | "bucket";

const CELL = 22;

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

  return (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${AVATAR_SIZE}, ${CELL}px)`,
          gridTemplateRows: `repeat(${AVATAR_SIZE}, ${CELL}px)`,
          border: "1px solid #ccc",
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
              background: pixels[i] ? color : "#fafafa",
              boxShadow: "inset 0 0 0 0.5px #eee",
              cursor: "crosshair",
            }}
          />
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 200 }}>
        <div style={{ display: "flex", gap: 8 }}>
          {(["pencil", "eraser", "bucket"] as Tool[]).map((t) => (
            <button
              key={t}
              onClick={() => setTool(t)}
              style={{
                padding: "6px 10px",
                fontWeight: tool === t ? 700 : 400,
                background: tool === t ? "#e0ecff" : "#fff",
                border: "1px solid #bbb",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              {t === "pencil" ? "Lápis" : t === "eraser" ? "Borracha" : "Balde"}
            </button>
          ))}
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          Cor:
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </label>

        <button onClick={() => setPixels(randomAvatarPixels())} style={btn}>
          Gerar aleatório
        </button>
        <button onClick={() => setPixels(new Uint8Array(AVATAR_PIXELS))} style={btn}>
          Limpar
        </button>

        <button onClick={save} disabled={saving} style={{ ...btn, background: "#2563eb", color: "#fff" }}>
          {saving ? "Salvando..." : "Salvar avatar"}
        </button>
        {msg && <span style={{ fontSize: 13 }}>{msg}</span>}
      </div>
    </div>
  );
}

const btn: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid #bbb",
  borderRadius: 6,
  background: "#fff",
  cursor: "pointer",
};
