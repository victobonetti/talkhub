/** Configuração via variáveis de ambiente. Infra real é definida depois. */
export const env = {
  PORT: Number(process.env.PORT ?? 2567),
  HOST: process.env.HOST ?? "0.0.0.0",
  DATABASE_URL: process.env.DATABASE_URL ?? "",

  /** Segredo para assinar os JWTs de sessão. Troque em produção. */
  JWT_SECRET: process.env.JWT_SECRET ?? "dev-insecure-secret-change-me",

  /** URL do front, para redirecionar após o OAuth. */
  WEB_URL: process.env.WEB_URL ?? "http://localhost:5173",

  /** Google OAuth (opcional no dev; guest funciona sem isto). */
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? "",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? "",
  GOOGLE_REDIRECT_URI:
    process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:2567/auth/google/callback",
};

export const googleConfigured = (): boolean =>
  Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
