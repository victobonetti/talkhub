import { useEffect, useState } from "react";
import type { PublicUser } from "@talkhub/shared";
import {
  captureTokenFromHash,
  clearToken,
  getMe,
  getToken,
  googleAvailable,
  googleLoginHref,
  loginGuest,
} from "./api";
import { AvatarEditor } from "./AvatarEditor";

export function App() {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

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
  };

  if (loading) return <Shell>Carregando…</Shell>;
  if (!user) return <Shell><Login onLogin={setUser} /></Shell>;

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
      <h2>Seu personagem (16×16)</h2>
      <AvatarEditor />
    </Shell>
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
        <a href={googleLoginHref()} style={{ padding: 10, textAlign: "center", border: "1px solid #bbb", borderRadius: 6 }}>
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
    <main style={{ fontFamily: "sans-serif", padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <h1>Talkhub</h1>
      {children}
    </main>
  );
}
