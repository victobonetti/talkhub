import { useEffect, useRef, useState } from "react";
import { CELL_SIZE, type PublicUser, type ServerListItem } from "@talkhub/shared";
import { base64ToBytes } from "@talkhub/shared";
import {
  captureTokenFromHash,
  clearToken,
  getAmbiente,
  getMe,
  getToken,
  googleAvailable,
  googleLoginHref,
  listServers,
  loginGuest,
} from "./api";
import { AvatarEditor } from "./AvatarEditor";
import { MapEditor } from "./MapEditor";
import { GameView } from "./GameView";

type View =
  | { name: "list" }
  | { name: "avatar" }
  | { name: "create" }
  | { name: "game"; ambienteId: string };

export function App() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>({ name: "list" });

  useEffect(() => {
    captureTokenFromHash();
    if (!getToken()) {
      setLoading(false);
      return;
    }
    getMe()
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  const logout = () => {
    clearToken();
    setUser(null);
    setView({ name: "list" });
  };

  const enterServer = (ambienteId: string | null) => {
    if (ambienteId) setView({ name: "game", ambienteId });
  };

  if (loading) return <Shell>Carregando…</Shell>;
  if (!user)
    return (
      <Shell>
        <Login onLogin={setUser} />
      </Shell>
    );

  return (
    <Shell>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>
          Olá, <strong>{user.displayName}</strong> ({user.kind})
        </span>
        <button onClick={logout} style={{ cursor: "pointer" }}>
          Sair
        </button>
      </header>

      {view.name === "list" && (
        <ServerList
          onCreate={() => setView({ name: "create" })}
          onEditAvatar={() => setView({ name: "avatar" })}
          onEnter={enterServer}
        />
      )}
      {view.name === "avatar" && (
        <section>
          <button onClick={() => setView({ name: "list" })}>← Voltar</button>
          <h2>Seu personagem (16×16)</h2>
          <AvatarEditor />
        </section>
      )}
      {view.name === "create" && (
        <section>
          <h2>Criar servidor</h2>
          <MapEditor
            onSaved={() => setView({ name: "list" })}
            onCancel={() => setView({ name: "list" })}
          />
        </section>
      )}
      {view.name === "game" && (
        <GameView ambienteId={view.ambienteId} onExit={() => setView({ name: "list" })} />
      )}
    </Shell>
  );
}

function ServerList({
  onCreate,
  onEditAvatar,
  onEnter,
}: {
  onCreate: () => void;
  onEditAvatar: () => void;
  onEnter: (ambienteId: string | null) => void;
}) {
  const [servers, setServers] = useState<ServerListItem[] | null>(null);

  useEffect(() => {
    listServers().then(setServers).catch(() => setServers([]));
  }, []);

  return (
    <section>
      <div style={{ display: "flex", gap: 8, margin: "12px 0" }}>
        <button onClick={onCreate} style={{ padding: "8px 12px" }}>
          + Criar servidor
        </button>
        <button onClick={onEditAvatar} style={{ padding: "8px 12px" }}>
          Editar avatar
        </button>
      </div>
      <h2>Servidores ativos</h2>
      {servers === null ? (
        <p>Carregando…</p>
      ) : servers.length === 0 ? (
        <p>Nenhum servidor ainda. Crie o primeiro!</p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          }}
        >
          {servers.map((s) => (
            <li
              key={s.id}
              onClick={() => onEnter(s.firstAmbienteId)}
              style={{
                border: "1px solid #ddd",
                borderRadius: 8,
                padding: 12,
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {s.firstAmbienteId && <ServerPreview ambienteId={s.firstAmbienteId} />}
              <div>
                <strong>{s.name}</strong>
                <div style={{ fontSize: 13, color: "#666" }}>por {s.ownerName}</div>
                <div style={{ fontSize: 12, color: s.playerCount > 0 ? "#1a8a3a" : "#999" }}>
                  ● {s.playerCount} online · {s.ambienteCount} ambiente(s)
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Miniatura do mapa do primeiro ambiente de um servidor. */
function ServerPreview({ ambienteId }: { ambienteId: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let active = true;
    getAmbiente(ambienteId)
      .then((a) => {
        if (!active || !ref.current) return;
        const wpx = a.wCells * CELL_SIZE;
        const hpx = a.hCells * CELL_SIZE;
        const cv = ref.current;
        cv.width = wpx;
        cv.height = hpx;
        const ctx = cv.getContext("2d")!;
        const idx = base64ToBytes(a.art);
        const img = ctx.createImageData(wpx, hpx);
        for (let i = 0; i < idx.length; i++) {
          const v = idx[i];
          const o = i * 4;
          if (v === 0) {
            img.data[o] = img.data[o + 1] = img.data[o + 2] = 240;
            img.data[o + 3] = 255;
          } else {
            const hex = a.palette[v - 1] ?? "#000000";
            img.data[o] = parseInt(hex.slice(1, 3), 16);
            img.data[o + 1] = parseInt(hex.slice(3, 5), 16);
            img.data[o + 2] = parseInt(hex.slice(5, 7), 16);
            img.data[o + 3] = 255;
          }
        }
        ctx.putImageData(img, 0, 0);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [ambienteId]);
  return (
    <canvas
      ref={ref}
      style={{
        width: "100%",
        height: 90,
        objectFit: "contain",
        imageRendering: "pixelated",
        background: "#fafafa",
        border: "1px solid #eee",
        borderRadius: 4,
      }}
    />
  );
}

function Login({ onLogin }: { onLogin: (u: PublicUser) => void }) {
  const [name, setName] = useState("");
  const [google, setGoogle] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    googleAvailable().then(setGoogle);
  }, []);

  const guest = async () => {
    setBusy(true);
    try {
      onLogin(await loginGuest(name.trim() || undefined));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 360, display: "flex", flexDirection: "column", gap: 12 }}>
      <h2>Entrar no Talkhub</h2>
      <input
        placeholder="Seu nome (opcional)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{ padding: 8 }}
      />
      <button onClick={guest} disabled={busy} style={{ padding: 10, cursor: "pointer" }}>
        Entrar como convidado
      </button>
      {google ? (
        <a
          href={googleLoginHref()}
          style={{ padding: 10, textAlign: "center", border: "1px solid #bbb", borderRadius: 6 }}
        >
          Entrar com Google
        </a>
      ) : (
        <span style={{ fontSize: 12, color: "#888" }}>
          (Login Google indisponível — configure as credenciais no servidor)
        </span>
      )}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ fontFamily: "sans-serif", padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1>Talkhub</h1>
      {children}
    </main>
  );
}
