# talkhub

App web onde *hosts* criam salas de chat compartilhadas com mundos pixel-art
exploráveis. Jogadores entram, desenham seu avatar 16×16, andam pelo mapa e
conversam num chat lateral efêmero.

## Status

Em desenvolvimento — **M0 (fundação)** e **M1 (auth & avatar)** concluídos:
scaffold do monorepo, realtime com Colyseus, schema Postgres, login
convidado/Google e editor de avatar 16×16. Veja a especificação técnica do MVP
em [`docs/PLAN.md`](docs/PLAN.md) e o roadmap na §12.

## Stack

React + Vite + Canvas · Fastify (REST) + **Colyseus** (realtime autoritativo) ·
**PostgreSQL** + **Prisma** · Google OAuth + guest. Monorepo com workspaces npm:
`apps/web`, `apps/server`, `packages/shared`.

## Desenvolvimento

Pré-requisitos: Node 20+ e (para persistência) PostgreSQL.

```bash
npm install

# configure os envs
cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env

# (quando houver Postgres) gerar client + aplicar schema
npm run prisma:generate -w @talkhub/server
npm run migrate -w @talkhub/server

# sobe shared (watch) + server + web juntos
npm run dev
```

- Server (REST + Colyseus): `http://localhost:2567` (`/health` para checar).
- Web (Vite): `http://localhost:5173`.

Scripts úteis: `npm run build`, `npm run typecheck`, `npm run lint`,
`npm run format`.

## Resumo do MVP

- Login via Google ou convidado; editor de avatar **monocromático** 16×16
  (pixels on/off, ou gerar aleatório).
- Lista de servidores ativos.
- Criar servidor: editor de mapa pixel-art com ferramenta de arte
  (lápis/borracha/balde) e ferramenta de colisão; nome do servidor.
- Conectar e explorar: split mapa | chat (horizontal no desktop, vertical com
  D-pad no mobile). Setas movem o jogador; digitar escreve no chat; Enter envia.
- **Chat por proximidade**: só converso com jogadores dentro do meu raio; uma
  barra inferior mostra quem está ouvindo (até 5 avatares + "+X").
- Movimento **servidor-autoritativo**; chat **efêmero e seguro** (nunca
  persistido).
