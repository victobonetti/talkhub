import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { GuestLoginSchema, type PublicUser } from "@talkhub/shared";
import { prisma } from "../db.js";
import { env, googleConfigured } from "../env.js";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO = "https://openidconnect.googleapis.com/v1/userinfo";

/** state anti-CSRF do OAuth (em memória; TODO: store compartilhado p/ multi-processo). */
const oauthStates = new Map<string, number>();
const STATE_TTL_MS = 5 * 60 * 1000;

function rememberState(): string {
  const state = randomBytes(16).toString("hex");
  oauthStates.set(state, Date.now() + STATE_TTL_MS);
  return state;
}

function consumeState(state: string | undefined): boolean {
  if (!state) return false;
  const exp = oauthStates.get(state);
  oauthStates.delete(state);
  return exp !== undefined && exp > Date.now();
}

function publicUser(u: { id: string; kind: string; displayName: string }): PublicUser {
  return { id: u.id, kind: u.kind as PublicUser["kind"], displayName: u.displayName };
}

function randomGuestName(): string {
  return `guest-${randomBytes(3).toString("hex")}`;
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  // --- Convidado: funciona sem credenciais externas ---
  app.post("/auth/guest", async (req) => {
    const body = GuestLoginSchema.parse(req.body ?? {});
    const user = await prisma.user.create({
      data: { kind: "guest", displayName: body.displayName ?? randomGuestName() },
    });
    const token = app.jwt.sign({ sub: user.id, kind: "guest", name: user.displayName });
    return { token, user: publicUser(user) };
  });

  // --- Usuário atual ---
  app.get("/auth/me", { preHandler: [app.authenticate] }, async (req, reply) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.sub } });
    if (!user) return reply.code(404).send({ error: "user_not_found" });
    return { user: publicUser(user) };
  });

  // Indica ao front se o login Google está disponível.
  app.get("/auth/google/available", async () => ({ available: googleConfigured() }));

  // --- Google OAuth (estruturado; ativa quando o env estiver configurado) ---
  app.get("/auth/google", async (_req, reply) => {
    if (!googleConfigured()) {
      return reply.code(503).send({ error: "google_oauth_not_configured" });
    }
    const url = new URL(GOOGLE_AUTH);
    url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
    url.searchParams.set("redirect_uri", env.GOOGLE_REDIRECT_URI);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", rememberState());
    return reply.redirect(url.toString());
  });

  app.get<{ Querystring: { code?: string; state?: string } }>(
    "/auth/google/callback",
    async (req, reply) => {
      if (!googleConfigured()) {
        return reply.code(503).send({ error: "google_oauth_not_configured" });
      }
      const { code, state } = req.query;
      if (!consumeState(state)) return reply.code(400).send({ error: "invalid_state" });
      if (!code) return reply.code(400).send({ error: "missing_code" });

      const tokenRes = await fetch(GOOGLE_TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: env.GOOGLE_REDIRECT_URI,
          grant_type: "authorization_code",
        }),
      });
      if (!tokenRes.ok) return reply.code(502).send({ error: "token_exchange_failed" });
      const tokenJson = (await tokenRes.json()) as { access_token?: string };
      if (!tokenJson.access_token) return reply.code(502).send({ error: "no_access_token" });

      const infoRes = await fetch(GOOGLE_USERINFO, {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      });
      if (!infoRes.ok) return reply.code(502).send({ error: "userinfo_failed" });
      const info = (await infoRes.json()) as { sub: string; name?: string; email?: string };

      const user = await prisma.user.upsert({
        where: { googleSub: info.sub },
        create: {
          kind: "google",
          googleSub: info.sub,
          displayName: info.name ?? info.email ?? "user",
        },
        update: { lastSeenAt: new Date() },
      });
      const token = app.jwt.sign({ sub: user.id, kind: "google", name: user.displayName });
      // Entrega o token ao front via fragment (não vai em logs de servidor).
      return reply.redirect(`${env.WEB_URL}/#token=${encodeURIComponent(token)}`);
    },
  );
}
