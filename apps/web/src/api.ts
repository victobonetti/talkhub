import type { AvatarDto, PublicUser } from "@talkhub/shared";

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
