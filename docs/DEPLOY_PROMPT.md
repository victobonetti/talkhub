# Prompt de deploy — Talkhub na infra do 4q (OCI)

> Cole este prompt numa sessão do Claude Code **rodando no repo `victobonetti/4q`**
> (que já tem o Terraform/OCI e todas as variáveis). Ele descreve **o que o app
> Talkhub precisa** para deployar e **como não conflitar** com o que já existe no
> 4q. Adapte os exemplos às convenções reais do 4q (paths, módulos TF, nomes de
> variáveis, forma de rodar serviço).

---

## Tarefa

Criar um pipeline/infra para deployar o app **Talkhub**
(`github.com/victobonetti/talkhub`, branch `main`) **na mesma instância OCI já
provisionada pelo 4q**, reutilizando o reverse proxy, o Postgres e a zona DNS
existentes — **sem duplicar recursos nem causar conflitos** com o 4q.

Use as variáveis/segredos que já existem no 4q (DNS zone `kod3.com.br`, instância
Compute, credenciais OCI, etc.). Não modifique recursos do 4q; apenas **adicione**
os do Talkhub.

## O que é o Talkhub (stack)

Monorepo (npm workspaces), Node 20+:

- `apps/web` — front-end **React + Vite**, build **estático** (`apps/web/dist`).
- `apps/server` — back-end **Fastify (REST) + Colyseus (WebSocket)**. **Processo
  Node de vida longa** (mantém conexões WebSocket e um game loop). REST e WSS na
  **mesma porta**. **NÃO é serverless** — não deployar como function.
- `packages/shared` — tipos/protocolo compartilhados (precisa ser buildado antes
  dos outros).
- **Banco**: PostgreSQL via **Prisma** (migrations em `apps/server/prisma/migrations`).

## Topologia de deploy (alvo)

| Componente | Como deployar | Domínio |
|---|---|---|
| `web` (estático) | Servir `apps/web/dist` pelo Caddy existente (site estático) | `talkhub.kod3.com.br` |
| `server` (long-running) | Processo Node atrás do Caddy (REST + WSS) | `talkhub-api.kod3.com.br` |
| Postgres | **Database dedicado** `talkhub` no cluster existente | — |

## Regras de não-conflito (importante)

1. **Subdomínios novos** sob `*.kod3.com.br`: `talkhub` e `talkhub-api`.
   **Confirme antes** que não estão em uso pelo 4q; se estiverem, escolha outros.
2. **Reverse proxy compartilhado**: se o 4q já roda **um Caddy** na 80/443,
   **adicione 2 blocos de site** (NÃO suba um segundo proxy). O bloco da API faz
   `reverse_proxy` para a porta local do server — o Caddy faz o upgrade de
   WebSocket automaticamente (não precisa de config extra de WS).
3. **Porta do server**: usar uma porta local **livre** (padrão `2567`; troque se
   o 4q já usar). **Não** expor a porta crua publicamente — só via Caddy.
4. **Postgres**: criar um **database `talkhub`** e um **role próprio** no cluster
   existente. Não tocar nos schemas do 4q.
5. **Serviço isolado**: unit `systemd` própria `talkhub-server.service` (ou
   serviço próprio no compose) — separada das do 4q.
6. **Rede OCI**: reutilizar o ingress 80/443 já aberto (Caddy). Não abrir a porta
   do server na security list/NSG.

## Variáveis de ambiente

**Server** (runtime — definir como secrets/vars do pipeline):

```
DATABASE_URL=postgresql://<user>:<pass>@<host>:5432/talkhub?schema=public
PORT=2567
HOST=0.0.0.0
JWT_SECRET=<gerar string aleatória forte>
WEB_URL=https://talkhub.kod3.com.br
# Google OAuth é OPCIONAL (login de convidado funciona sem). Se usar:
GOOGLE_CLIENT_ID=<...>
GOOGLE_CLIENT_SECRET=<...>
GOOGLE_REDIRECT_URI=https://talkhub-api.kod3.com.br/auth/google/callback
```

**Web** (build-time — embutidas no bundle Vite):

```
VITE_API_URL=https://talkhub-api.kod3.com.br
VITE_SERVER_URL=wss://talkhub-api.kod3.com.br
```

## Build & migração (comandos verificados)

A partir da raiz do repo Talkhub:

```bash
# 1. deps
npm ci

# 2. gerar Prisma Client (necessário antes de buildar o server)
npm run prisma:generate -w @talkhub/server

# 3. build de tudo (shared -> server -> web)
npm run build            # ou: npm run build -w @talkhub/shared && ... -w @talkhub/server && ... -w @talkhub/web

# 4. aplicar migrations no Postgres de produção (idempotente)
DATABASE_URL=... npm run migrate:deploy -w @talkhub/server
```

Artefatos:
- Estático do front: `apps/web/dist/`
- Server compilado: `apps/server/dist/` (entry: `apps/server/dist/index.js`)

Rodar o server (long-running):

```bash
# do diretório raiz do repo (resolve o workspace @talkhub/shared e @prisma/client)
node apps/server/dist/index.js
# ou: npm run start -w @talkhub/server
```

## Etapas sugeridas do pipeline (CI/CD no 4q)

1. Checkout do `talkhub` (`main`).
2. Setup Node 20 + `npm ci`.
3. `npm run prisma:generate -w @talkhub/server`.
4. Build web com as `VITE_*` → publicar `apps/web/dist` na raiz do site do Caddy
   (ou no object storage que o 4q usa).
5. `npm run migrate:deploy -w @talkhub/server` (com `DATABASE_URL`).
6. Build server → enviar `apps/server/dist` (+ `node_modules` ou rodar `npm ci
   --omit=dev` no host) para a instância → `systemctl restart talkhub-server`.
7. Recarregar o Caddy com os 2 novos blocos de site.

## Exemplos (ADAPTAR às convenções do 4q)

**Caddyfile — adicionar (não substituir):**

```caddy
talkhub.kod3.com.br {
    root * /var/www/talkhub
    file_server
    try_files {path} /index.html   # SPA fallback
}

talkhub-api.kod3.com.br {
    reverse_proxy 127.0.0.1:2567   # REST + WebSocket (Colyseus); WS upgrade automático
}
```

**systemd — `/etc/systemd/system/talkhub-server.service`:**

```ini
[Unit]
Description=Talkhub realtime server (Fastify + Colyseus)
After=network.target postgresql.service

[Service]
WorkingDirectory=/opt/talkhub
ExecStart=/usr/bin/node apps/server/dist/index.js
EnvironmentFile=/opt/talkhub/.env.server
Restart=always
User=talkhub

[Install]
WantedBy=multi-user.target
```

**Postgres — provisionar database isolado:**

```sql
CREATE ROLE talkhub LOGIN PASSWORD '<...>';
CREATE DATABASE talkhub OWNER talkhub;
```

## Restrições que o pipeline DEVE respeitar

- O **server é stateful/long-running** — nunca como function/serverless.
- **WSS ponta a ponta**: Caddy termina o TLS e faz proxy do WebSocket para o
  server (mesma porta do REST).
- **Reutilizar** as variáveis do 4q para instância, zona DNS (`kod3.com.br`) e
  secrets; **adicionar** recursos do Talkhub sem alterar/duplicar os do 4q.
- **Confirmar** subdomínios e porta livres antes de aplicar.
