import { useEffect, useRef, useState } from "react";
import { CELL_SIZE, type PublicUser, type ServerListItem } from "@talkhub/shared";
import { base64ToBytes } from "@talkhub/shared";
import type { AmbienteMetaDto } from "@talkhub/shared";
import {
  captureTokenFromHash,
  clearToken,
  createPortal,
  getAmbiente,
  getMe,
  getServer,
  getToken,
  googleAvailable,
  googleLoginHref,
  listServers,
  loginGuest,
} from "./api";
import { AvatarEditor } from "./AvatarEditor";
import { MapEditor } from "./MapEditor";
import { GameView } from "./GameView";
import {
  PixelBadge,
  PixelButton,
  PixelHeading,
  PixelInput,
  PixelPanel,
  PixelSelect,
  PixelToolbar,
} from "./ui";

type View =
  | { name: "list" }
  | { name: "avatar" }
  | { name: "create"; serverId?: string }
  | { name: "manage"; serverId: string }
  | { name: "game"; ambienteId: string; spawn?: { x: number; y: number } };

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

  if (loading)
    return (
      <Shell>
        <div style={{ display: "flex", justifyContent: "center", padding: "var(--sp-7) 0" }}>
          <PixelPanel tone="inset" style={{ textAlign: "center" }}>
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontSize: "var(--fs-d-md)",
                color: "var(--c-ink-dim)",
              }}
            >
              Carregando o mundo…
            </span>
          </PixelPanel>
        </div>
      </Shell>
    );
  if (!user)
    return (
      <Shell>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Login onLogin={setUser} />
        </div>
      </Shell>
    );

  return (
    <Shell>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "var(--sp-3)",
          marginBottom: "var(--sp-5)",
        }}
      >
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--sp-2)",
            fontSize: "var(--fs-sm)",
          }}
        >
          Olá, <strong>{user.displayName}</strong>
          <PixelBadge tone={user.kind === "google" ? "info" : "muted"}>
            {user.kind === "google" ? "google" : "convidado"}
          </PixelBadge>
        </span>
        <PixelButton variant="ghost" size="sm" onClick={logout}>
          Sair
        </PixelButton>
      </header>

      {view.name === "list" && (
        <ServerList
          onCreate={() => setView({ name: "create" })}
          onEditAvatar={() => setView({ name: "avatar" })}
          onEnter={enterServer}
          onManage={(serverId) => setView({ name: "manage", serverId })}
        />
      )}
      {view.name === "avatar" && (
        <section style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
          <div style={{ display: "flex", gap: "var(--sp-3)", alignItems: "center" }}>
            <PixelButton variant="ghost" size="sm" onClick={() => setView({ name: "list" })}>
              ← Voltar
            </PixelButton>
            <PixelHeading as="h2">Seu personagem (16×16)</PixelHeading>
          </div>
          <AvatarEditor />
        </section>
      )}
      {view.name === "create" && (
        <section style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
          <PixelHeading as="h2">
            {view.serverId ? "Adicionar ambiente" : "Criar servidor"}
          </PixelHeading>
          <MapEditor
            serverId={view.serverId}
            onSaved={(serverId) => setView({ name: "manage", serverId })}
            onCancel={() =>
              setView(view.serverId ? { name: "manage", serverId: view.serverId } : { name: "list" })
            }
          />
        </section>
      )}
      {view.name === "manage" && (
        <ManageServer
          serverId={view.serverId}
          onBack={() => setView({ name: "list" })}
          onAddAmbiente={() => setView({ name: "create", serverId: view.serverId })}
          onEnter={(ambienteId) => setView({ name: "game", ambienteId })}
        />
      )}
      {view.name === "game" && (
        <GameView
          key={view.ambienteId}
          ambienteId={view.ambienteId}
          initialSpawn={view.spawn}
          onExit={() => setView({ name: "list" })}
          onPortal={(targetAmbienteId, spawn) =>
            setView({ name: "game", ambienteId: targetAmbienteId, spawn })
          }
        />
      )}
    </Shell>
  );
}

function ServerList({
  onCreate,
  onEditAvatar,
  onEnter,
  onManage,
}: {
  onCreate: () => void;
  onEditAvatar: () => void;
  onEnter: (ambienteId: string | null) => void;
  onManage: (serverId: string) => void;
}) {
  const [servers, setServers] = useState<ServerListItem[] | null>(null);

  useEffect(() => {
    listServers().then(setServers).catch(() => setServers([]));
  }, []);

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
      <PixelToolbar>
        <PixelButton variant="primary" onClick={onCreate}>
          + Criar servidor
        </PixelButton>
        <PixelButton variant="default" onClick={onEditAvatar}>
          ✎ Editar avatar
        </PixelButton>
      </PixelToolbar>
      <PixelHeading as="h2">Servidores ativos</PixelHeading>
      {servers === null ? (
        <div>
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              display: "grid",
              gap: "var(--sp-3)",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            }}
          >
            {[0, 1, 2, 3].map((i) => (
              <li key={i}>
                <PixelPanel tone="inset" style={{ minHeight: 170 }} aria-hidden>
                  <div
                    style={{
                      width: "100%",
                      height: 90,
                      background: "var(--c-panel)",
                      border: "var(--bw-thin) solid var(--c-border)",
                    }}
                  />
                </PixelPanel>
              </li>
            ))}
          </ul>
          <p style={{ color: "var(--c-ink-dim)", marginTop: "var(--sp-3)" }}>Procurando mundos…</p>
        </div>
      ) : servers.length === 0 ? (
        <PixelPanel
          tone="inset"
          style={{
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "var(--sp-3)",
          }}
        >
          <span style={{ fontSize: 40, lineHeight: 1 }}>🗺️</span>
          <p style={{ color: "var(--c-ink-dim)" }}>
            Nenhum mundo por aqui ainda. Crie o primeiro!
          </p>
          <PixelButton variant="primary" onClick={onCreate}>
            + Criar servidor
          </PixelButton>
        </PixelPanel>
      ) : (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "grid",
            gap: "var(--sp-3)",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          }}
        >
          {servers.map((s) => (
            <li key={s.id}>
              <PixelPanel
                tone="raised"
                role="button"
                tabIndex={0}
                onClick={() => onEnter(s.firstAmbienteId)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onEnter(s.firstAmbienteId);
                  }
                }}
                style={{
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--sp-2)",
                  height: "100%",
                }}
              >
                {s.firstAmbienteId && <ServerPreview ambienteId={s.firstAmbienteId} />}
                <PixelHeading as="h3">{s.name}</PixelHeading>
                <div style={{ fontSize: "var(--fs-sm)", color: "var(--c-ink-dim)" }}>
                  por {s.ownerName}
                </div>
                <div>
                  <PixelBadge tone={s.playerCount > 0 ? "online" : "muted"}>
                    {s.playerCount > 0 && <span className="px-badge__dot" />}
                    {s.playerCount} online · {s.ambienteCount} ambiente(s)
                  </PixelBadge>
                </div>
                <PixelButton
                  variant="ghost"
                  size="sm"
                  style={{ alignSelf: "flex-start" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onManage(s.id);
                  }}
                >
                  ⚙ Gerenciar
                </PixelButton>
              </PixelPanel>
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
        background: "var(--c-panel)",
        border: "var(--bw-thin) solid var(--c-border)",
      }}
    />
  );
}

function ManageServer({
  serverId,
  onBack,
  onAddAmbiente,
  onEnter,
}: {
  serverId: string;
  onBack: () => void;
  onAddAmbiente: () => void;
  onEnter: (ambienteId: string) => void;
}) {
  const [ambientes, setAmbientes] = useState<AmbienteMetaDto[] | null>(null);
  const reload = () => getServer(serverId).then((s) => setAmbientes(s.ambientes)).catch(() => {});
  useEffect(() => {
    reload();
  }, [serverId]);

  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
      <div style={{ display: "flex", gap: "var(--sp-3)", alignItems: "center" }}>
        <PixelButton variant="ghost" size="sm" onClick={onBack}>
          ← Voltar
        </PixelButton>
        <PixelHeading as="h2">Gerenciar servidor</PixelHeading>
      </div>

      <PixelPanel title="Ambientes" tone="raised">
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "var(--sp-2)" }}>
          {ambientes === null ? (
            <li>
              <span style={{ color: "var(--c-ink-dim)" }}>Carregando ambientes…</span>
            </li>
          ) : (
            ambientes.map((a) => (
              <li key={a.id}>
                <PixelPanel
                  tone="inset"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "var(--sp-2)",
                    padding: "var(--sp-2) var(--sp-3)",
                  }}
                >
                  <strong style={{ fontFamily: "var(--font-display)", fontSize: "var(--fs-d-sm)" }}>
                    {a.name}
                  </strong>
                  <PixelBadge tone="muted">
                    {a.wCells}×{a.hCells}
                  </PixelBadge>
                  <PixelBadge tone="info">raio {a.chatRadius}</PixelBadge>
                  <PixelButton
                    variant="primary"
                    size="sm"
                    style={{ marginLeft: "auto" }}
                    onClick={() => onEnter(a.id)}
                  >
                    Entrar
                  </PixelButton>
                </PixelPanel>
              </li>
            ))
          )}
        </ul>
        <div style={{ marginTop: "var(--sp-3)" }}>
          <PixelButton variant="default" onClick={onAddAmbiente}>
            + Adicionar ambiente
          </PixelButton>
        </div>
      </PixelPanel>

      {ambientes && ambientes.length >= 2 && (
        <PortalForm ambientes={ambientes} onCreated={reload} />
      )}
      {ambientes && ambientes.length < 2 && (
        <PixelPanel tone="inset">
          <p style={{ color: "var(--c-ink-dim)" }}>
            Adicione um segundo ambiente para criar portais entre eles.
          </p>
        </PixelPanel>
      )}
    </section>
  );
}

function PortalForm({
  ambientes,
  onCreated,
}: {
  ambientes: AmbienteMetaDto[];
  onCreated: () => void;
}) {
  const [from, setFrom] = useState(ambientes[0].id);
  const [to, setTo] = useState(ambientes[1].id);
  const [cell, setCell] = useState({ x: 0, y: 0 });
  const [spawn, setSpawn] = useState({ x: 0, y: 0 });
  const [msg, setMsg] = useState("");

  const create = async () => {
    setMsg("");
    try {
      await createPortal(from, {
        cellX: cell.x,
        cellY: cell.y,
        targetAmbienteId: to,
        targetSpawnX: spawn.x,
        targetSpawnY: spawn.y,
      });
      setMsg("Portal criado!");
      onCreated();
    } catch {
      setMsg("Erro ao criar portal.");
    }
  };

  const num = (v: string) => Math.max(0, Math.round(Number(v) || 0));

  const fieldLabel = {
    fontFamily: "var(--font-display)",
    fontSize: "var(--fs-d-sm)",
    color: "var(--c-ink-dim)",
  } as const;

  return (
    <PixelPanel title="Criar portal" tone="raised">
      <div style={{ display: "grid", gap: "var(--sp-3)" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "var(--sp-2)",
          }}
        >
          <span style={fieldLabel}>Sai de</span>
          <PixelSelect
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            style={{ width: "auto", minWidth: 120 }}
          >
            {ambientes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </PixelSelect>
          <span style={fieldLabel}>na célula x</span>
          <PixelInput
            type="number"
            value={cell.x}
            onChange={(e) => setCell({ ...cell, x: num(e.target.value) })}
            style={{ width: 72 }}
          />
          <span style={fieldLabel}>y</span>
          <PixelInput
            type="number"
            value={cell.y}
            onChange={(e) => setCell({ ...cell, y: num(e.target.value) })}
            style={{ width: 72 }}
          />
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "var(--sp-2)",
          }}
        >
          <span style={fieldLabel}>Chega em</span>
          <PixelSelect
            value={to}
            onChange={(e) => setTo(e.target.value)}
            style={{ width: "auto", minWidth: 120 }}
          >
            {ambientes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </PixelSelect>
          <span style={fieldLabel}>spawn x</span>
          <PixelInput
            type="number"
            value={spawn.x}
            onChange={(e) => setSpawn({ ...spawn, x: num(e.target.value) })}
            style={{ width: 72 }}
          />
          <span style={fieldLabel}>y</span>
          <PixelInput
            type="number"
            value={spawn.y}
            onChange={(e) => setSpawn({ ...spawn, y: num(e.target.value) })}
            style={{ width: 72 }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
          <PixelButton variant="primary" onClick={create}>
            Criar portal
          </PixelButton>
          {msg && (
            <PixelBadge tone={msg === "Portal criado!" ? "online" : "warn"}>{msg}</PixelBadge>
          )}
        </div>
      </div>
    </PixelPanel>
  );
}

function Login({ onLogin }: { onLogin: (u: PublicUser) => void }) {
  const [name, setName] = useState("");
  const [google, setGoogle] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);

  useEffect(() => {
    googleAvailable().then(setGoogle);
  }, []);

  const guest = async () => {
    setBusy(true);
    setErr(false);
    try {
      onLogin(await loginGuest(name.trim() || undefined));
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <PixelPanel title="Entrar no Talkhub" tone="raised" style={{ width: "100%", maxWidth: 360 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
        <PixelInput
          placeholder="Seu nome (opcional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) guest();
          }}
        />
        <PixelButton
          variant="primary"
          size="md"
          onClick={guest}
          disabled={busy}
          style={{ width: "100%" }}
        >
          {busy ? "Entrando…" : "Entrar como convidado"}
        </PixelButton>
        {err && (
          <PixelBadge tone="warn">Não deu para entrar — tente de novo.</PixelBadge>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-display)",
            fontSize: "var(--fs-d-sm)",
            color: "var(--c-ink-faint)",
          }}
        >
          ou
        </div>
        {google ? (
          <a href={googleLoginHref()} className="px-btn px-btn--default px-btn--md" style={{ width: "100%" }}>
            Entrar com Google
          </a>
        ) : (
          <PixelPanel tone="inset">
            <span style={{ fontSize: "var(--fs-sm)", color: "var(--c-ink-dim)" }}>
              Login Google indisponível no momento — você ainda pode entrar como convidado.
            </span>
          </PixelPanel>
        )}
      </div>
    </PixelPanel>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main
      style={{
        padding: "var(--sp-5)",
        maxWidth: 960,
        margin: "0 auto",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--sp-3)",
          marginBottom: "var(--sp-5)",
        }}
      >
        <PixelHeading as="h1">Talkhub</PixelHeading>
      </div>
      {children}
    </main>
  );
}
