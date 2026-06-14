import type {
  AmbienteCreateInput,
  AmbienteFullDto,
  AmbienteMetaDto,
  AvatarDto,
  PortalCreateInput,
  PublicUser,
  ServerCreateInput,
  ServerListItem,
} from "@talkhub/shared";

export const SERVER_WS_URL = import.meta.env.VITE_SERVER_URL ?? "ws://localhost:2567";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:2567";
const TOKEN_KEY = "talkhub_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/** Captura o token entregue pelo OAuth via fragment (#token=...) e limpa a URL. */
export function captureTokenFromHash(): void {
  const hash = window.location.hash;
  const m = hash.match(/token=([^&]+)/);
  if (m) {
    setToken(decodeURIComponent(m[1]));
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json() as Promise<T>;
}

export async function loginGuest(displayName?: string): Promise<PublicUser> {
  const body = displayName ? JSON.stringify({ displayName }) : "{}";
  const { token, user } = await req<{ token: string; user: PublicUser }>("/auth/guest", {
    method: "POST",
    body,
  });
  setToken(token);
  return user;
}

export async function getMe(): Promise<PublicUser> {
  const { user } = await req<{ user: PublicUser }>("/auth/me");
  return user;
}

export async function googleAvailable(): Promise<boolean> {
  try {
    const { available } = await req<{ available: boolean }>("/auth/google/available");
    return available;
  } catch {
    return false;
  }
}

export function googleLoginHref(): string {
  return `${API}/auth/google`;
}

export async function getAvatar(): Promise<AvatarDto | null> {
  const { avatar } = await req<{ avatar: AvatarDto | null }>("/avatar/me");
  return avatar;
}

export async function putAvatar(bits: string, color: string): Promise<AvatarDto> {
  const { avatar } = await req<{ avatar: AvatarDto }>("/avatar/me", {
    method: "PUT",
    body: JSON.stringify({ bits, color }),
  });
  return avatar;
}

export async function listServers(): Promise<ServerListItem[]> {
  const { servers } = await req<{ servers: ServerListItem[] }>("/servers");
  return servers;
}

export async function createServer(
  input: ServerCreateInput,
): Promise<{ id: string; ambienteId: string }> {
  return req("/servers", { method: "POST", body: JSON.stringify(input) });
}

export async function getAmbiente(id: string): Promise<AmbienteFullDto> {
  const { ambiente } = await req<{ ambiente: AmbienteFullDto }>(`/ambientes/${id}`);
  return ambiente;
}

interface ServerDetail {
  id: string;
  name: string;
  ownerName: string;
  ambientes: AmbienteMetaDto[];
}
export async function getServer(id: string): Promise<ServerDetail> {
  return req<ServerDetail>(`/servers/${id}`);
}

export async function addAmbiente(
  serverId: string,
  ambiente: AmbienteCreateInput,
): Promise<{ id: string }> {
  return req(`/servers/${serverId}/ambientes`, { method: "POST", body: JSON.stringify(ambiente) });
}

export async function createPortal(
  ambienteId: string,
  body: PortalCreateInput,
): Promise<{ id: string }> {
  return req(`/ambientes/${ambienteId}/portals`, { method: "POST", body: JSON.stringify(body) });
}
