import { useEffect, useState } from "react";
import type { PublicUser, ServerListItem } from "@talkhub/shared";
import {
  captureTokenFromHash,
  clearToken,
  getMe,
  getToken,
  googleAvailable,
  googleLoginHref,
  listServers,
  loginGuest,
} from "./api";
import { AvatarEditor } from "./AvatarEditor";
import { MapEditor } from "./MapEditor";

type View = "list" | "avatar" | "create";

export function App() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("list");

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
    setView("list");
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

      {view === "list" && (
        <ServerList onCreate={() => setView("create")} onEditAvatar={() => setView("avatar")} />
      )}
      {view === "avatar" && (
        <section>
          <button onClick={() => setView("list")}>← Voltar</button>
          <h2>Seu personagem (16×16)</h2>
          <AvatarEditor />
        </section>
      )}
      {view === "create" && (
        <section>
          <h2>Criar servidor</h2>
          <MapEditor onSaved={() => setView("list")} onCancel={() => setView("list")} />
        </section>
      )}
    </Shell>
  );
}

function ServerList({
  onCreate,
  onEditAvatar,
}: {
  onCreate: () => void;
  onEditAvatar: () => void;
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
        <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: 8 }}>
          {servers.map((s) => (
            <li
              key={s.id}
              style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12 }}
            >
              <strong>{s.name}</strong>
              <div style={{ fontSize: 13, color: "#666" }}>
                por {s.ownerName} · {s.ambienteCount} ambiente(s)
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
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
