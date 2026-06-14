/** Configuração via variáveis de ambiente. Infra real é definida depois. */
export const env = {
  PORT: Number(process.env.PORT ?? 2567),
  HOST: process.env.HOST ?? "0.0.0.0",
  DATABASE_URL: process.env.DATABASE_URL ?? "",
};
