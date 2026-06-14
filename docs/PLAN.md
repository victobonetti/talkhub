# Talkhub — Plano & Especificação Técnica (MVP)

> App web onde *hosts* criam salas de chat compartilhadas com mundos pixel-art
> exploráveis. Jogadores entram, andam pelo mapa e conversam num chat lateral.

Status: **planejamento**. Este documento é a fonte da verdade do escopo do MVP
e da arquitetura. Decisões de infra ficam para depois — aqui o foco é a **spec
de código** e o contrato entre as partes.

---

## 1. Decisões já tomadas

| Tópico | Decisão |
|---|---|
| Hospedagem | Self-hosted na máquina própria (OCI free tier, ARM). **Sem lock-in de cloud gerenciada.** |
| Movimento | **Servidor autoritativo** (valida colisão/limites, retransmite estado). |
| Persistência | Mapas/servidores, avatar do usuário e posição do jogador. |
| Chat | **Efêmero e seguro** — nunca gravado em disco/DB. |
| Auth | Google OAuth + convidado (guest). |

---

## 2. Visão geral da arquitetura

Monorepo com três pacotes, compartilhando tipos e protocolo:

```
talkhub/
├─ apps/
│  ├─ web/            # Front-end (React + Vite + TS), render em Canvas
│  └─ server/         # Back-end (Node + TS): HTTP/REST + WebSocket autoritativo
├─ packages/
│  └─ shared/         # Tipos, schemas (zod), mensagens Colyseus, constantes
├─ docs/
└─ ...
```

- **Front-end**: SPA React. Renderização do mundo e avatares em `<canvas>`
  (2D ou PixiJS). Editores (avatar e mapa) também em canvas.
- **Back-end**: processo Node responsável por:
  - REST (Fastify): auth, CRUD de servidores/mapas, avatar.
  - Realtime (Colyseus): uma `Room` autoritativa por ambiente + relay de chat
    efêmero por proximidade. Escala horizontal via driver Redis (ver §7).
- **shared**: definições `zod`/TypeScript usadas pelos dois lados — **uma única
  definição** do protocolo, sem divergência client/server.

### Stack recomendada (revisável)

| Camada | Escolha | Por quê |
|---|---|---|
| Front | React + Vite + TypeScript | Rápido, ecossistema, build estático servível por qualquer reverse proxy. |
| Render | Canvas 2D (evoluir p/ PixiJS se precisar) | Pixel-art não precisa de GPU pesada no MVP. |
| Estado client | Zustand | Leve, sem boilerplate. |
| Back HTTP | Fastify | Performático, TS-first, leve em ARM. |
| Realtime | **Colyseus** (game server autoritativo, salas) | **Decidido.** Salas, state-sync binário, reconexão e **escala horizontal** (driver Redis + presence) prontos. Ver §7. |
| DB | **PostgreSQL** + **Prisma** (ORM) | **Decidido.** Robusto, roda bem no free tier ARM; Prisma dá migrations versionadas e tipos gerados. |
| Auth | Google OAuth 2.0 (OIDC) + JWT próprio p/ sessão e guest | Sem dependência de auth gerenciado. |

> Tudo escolhido para rodar num único host ARM atrás de um reverse proxy com
> TLS (ex.: Caddy) servindo `web` estático e fazendo proxy de `/api` e `/ws`.

---

## 3. Conceitos de domínio

- **User**: conta Google **ou** guest. Tem um **Avatar** (sprite 16×16).
- **Avatar**: sprite 16×16 monocromático (silhueta on/off) + cor única, criado
  no editor ou gerado proceduralmente. Persistido e vinculado ao user.
- **Server (Hub)**: criado por um host. Tem nome e um ou mais **Ambientes**.
- **Ambiente (Room/Map)**: um mundo pixel-art explorável. Contém:
  - **Camada de arte**: bitmap pixel-art indexado por paleta (dados crus).
  - **Camada de colisão**: grid de células de 16px (booleano: bloqueia ou não).
  - **Spawn point(s)**: onde jogadores aparecem.
  - (*Melhoria*) **Portais**: ligam ambientes entre si ("andar por ambientes").
- **Session/Presence**: jogador conectado a um ambiente, com posição autoritativa.

### Modelo espacial (importante)

- O mundo é uma **bitmap pixel-art** (arte livre, pintada pixel a pixel).
- A **colisão** vive num **grid de células de 16×16 px** alinhado ao mundo. Isso
  mantém a checagem de colisão O(1) e barata no servidor.
- O **jogador é 16×16** e se move **célula a célula** nesse grid (movimento
  *grid-based*, não físico). As setas movem 1 célula por passo (com repetição ao
  segurar). O cliente **interpola** o deslocamento visualmente; o servidor pensa
  em coordenadas de célula.

Movimento grid-based + servidor autoritativo = validação trivial (a célula
destino existe? está livre? é adjacente?) e custo de CPU/banda mínimo — ideal
para o free tier.

### Princípio: pixels são dados crus renderizados (sem PNG)

**Nada é armazenado ou trafegado como PNG/imagem codificada.** Todo conteúdo
pixel-art é **dado cru** desenhado em `<canvas>` no cliente:

- **Avatar**: 32 bytes de bits (silhueta on/off) + uma cor. Render: pinta os
  pixels ligados na cor do usuário.
- **Arte do mapa**: paleta (`hex[]`) + um índice de paleta por pixel
  (`art_indices`). Render: lê o índice, pinta a cor da paleta. Sem decodificar
  imagem.
- **Colisão**: bitset por célula.

Otimizações previstas: **paleta indexada** (1 byte/pixel, ou 4 bits se ≤16
cores); **RLE** sobre os índices (mundos pixel-art têm grandes áreas de cor
uniforme → compressão alta e barata); upload do canvas via `ImageData`/typed
arrays; render com `image-rendering: pixelated` e, se necessário, off-screen
canvas + dirty-rects. Assim controlamos byte a byte o que vai pra rede e pro
banco, sem o overhead de encode/decode de PNG.

---

## 4. Modelo de dados (persistência)

Persistido (Postgres). **Mensagens de chat NÃO entram aqui.**

```
users
  id            uuid pk
  kind          enum('google','guest')
  google_sub    text null unique     -- subject do OIDC
  display_name  text
  created_at    timestamptz
  last_seen_at  timestamptz

avatars
  user_id       uuid pk fk->users
  -- sprite 16x16 MONOCROMÁTICO: 1 bit/pixel = 256 bits = 32 bytes (ver §6)
  bits          bytea            -- exatamente 32 bytes (silhueta on/off)
  color         text not null    -- cor única de exibição do avatar (hex)
  updated_at    timestamptz

servers            -- "Hub"
  id            uuid pk
  owner_id      uuid fk->users
  name          text
  is_public     bool
  created_at    timestamptz

ambientes          -- mapas/rooms dentro de um server
  id            uuid pk
  server_id     uuid fk->servers
  name          text
  width_px      int              -- múltiplo de 16
  height_px     int              -- múltiplo de 16
  art_palette   jsonb            -- paleta de cores do mundo: hex[] (até 16/256)
  art_indices   bytea            -- 1 índice de paleta por pixel (W*H), sem PNG
  collision     bytea            -- bitset (W/16)*(H/16) bits
  spawn_x       int              -- célula
  spawn_y       int
  chat_radius   int              -- raio de chat por proximidade, em células (§9)
  created_at    timestamptz

player_positions   -- "lembrar onde o jogador estava"
  user_id       uuid fk->users
  ambiente_id   uuid fk->ambientes
  cell_x        int
  cell_y        int
  updated_at    timestamptz
  pk(user_id, ambiente_id)

portais (melhoria)
  id            uuid pk
  ambiente_id   uuid fk->ambientes
  cell_x        int
  cell_y        int
  target_ambiente_id uuid fk->ambientes
  target_spawn_x int
  target_spawn_y int
```

---

## 5. Telas / fluxos de UX

1. **Login** — botão "Entrar com Google" e "Entrar como convidado".
2. **Criação/edição de avatar** — editor 16×16 **monocromático** (lápis/borracha
   /balde, pixels on/off) + **seletor de uma cor única** de exibição, e botão
   **"Gerar aleatório"** (silhueta procedural simétrica). Salva no user.
3. **Lista de servidores ativos** — cards com nome, nº de jogadores online,
   preview do mapa. Botões: *Entrar* / *Criar servidor*.
4. **Criar servidor** — nome + **editor de mapa** (§8).
5. **Game view** — split 50/50: mapa explorável | chat. Ver §9 e §10.

### Layout

- **Desktop**: split **horizontal** — mapa à esquerda (50%), chat à direita (50%).
- **Mobile**: split **vertical** — mapa em cima, chat embaixo; **botões
  auxiliares na tela** (D-pad para mover + campo de chat). Ver §10.

No chat, cada mensagem mostra uma **miniatura do avatar 16×16** do remetente ao
lado do texto.

Na **parte inferior** do game view há uma **barra de ouvintes**: as miniaturas
dos avatares dos jogadores que estão dentro do meu raio de chat (quem vai me
escutar). Mostra até 5 e, se houver mais, um indicador **"+X"** (§9).

---

## 6. Formato do avatar (sprite 16×16 **monocromático**)

O personagem desenhado pelo jogador é **monocor**: cada pixel é apenas
**ligado/desligado** (silhueta), sem paleta de cores.

- **Representação**: bitmap **1 bit por pixel** → 256 bits = **32 bytes**.
  Extremamente compacto (cabe num `BIGINT[4]` ou `bytea(32)`/base64 de 44 chars).
- **Cor única de exibição (por usuário)**: o sprite é monocor, mas cada usuário
  escolhe **uma cor** para pintar a silhueta. O dado guarda os 32 bytes (on/off)
  **+ um campo `color`** (hex) com a cor escolhida. Os pixels ligados são
  pintados nessa cor; os desligados ficam transparentes. Continua "monocor" — é
  uma só cor por avatar, definida pelo dono (não pelo tema do cliente).
- **Editor**: grade 16×16 com toggle de pixel; ferramentas **lápis** (liga),
  **borracha** (desliga) e **balde** (flood fill liga/desliga). Há um **seletor
  de cor única** (um swatch/color picker) que define a cor de exibição do avatar
  inteiro — não é por pixel, é a cor do personagem.
- **Gerador aleatório**: liga pixels numa metade e **espelha horizontalmente**
  (estilo identicon) → silhuetas simétricas e únicas, com densidade controlada.
- **Miniatura no chat e barra de ouvintes**: o cliente tem os 32 bytes + a
  `color`; renderiza num `<canvas>` 16×16 escalado com `image-rendering:
  pixelated`, pintando os pixels ligados na cor única do usuário. Sem custo de
  rede extra.

---

## 7. Realtime com Colyseus (servidor autoritativo)

Realtime roda em **Colyseus**: **uma `Room` por ambiente** (`AmbienteRoom`). A
escolha mira **escala** — Colyseus distribui salas entre processos com o **driver
Redis + presence**, então dá para crescer horizontalmente sem reescrever a
lógica de sala (ver §abaixo).

### Estado da sala (Schema) — sincronizado automaticamente

O movimento é o único dado **sincronizado por state-sync** (patches binários do
Colyseus). Como as salas são pequenas, sincronizamos **todos** os players da
sala (sem `@filter()`), o que mantém o MVP simples:

```
AmbienteRoom.state (Schema):
  players: MapSchema<PlayerState>
PlayerState:
  id          string   // sessionId
  userId      string
  displayName string
  cellX       int
  cellY       int
  dir         'up'|'down'|'left'|'right'
  // avatar (32 bytes bits + color) enviado 1x no onJoin via mensagem,
  // não vai no Schema (não muda durante a sessão)
```

- **Movimento autoritativo**: cliente envia a *intenção* `move`; o servidor
  valida no `onMessage` (adjacência, limites, colisão) e, se válido, atualiza
  `PlayerState` — o state-sync do Colyseus propaga o patch a todos na sala.
- **Tick**: o `setSimulationInterval` da Room roda a ~10–15 Hz; movimento
  enfileirado é resolvido por tick (evita flood de patches).
- **Predição/reconciliação**: cliente prediz o passo e corrige se o estado
  sincronizado divergir (raro em grid-based). Interpolação suaviza o render.

### Chat e proximidade — mensagens (NÃO entram no Schema)

Chat é **efêmero** e **escopado por proximidade**, então **não** vai no `Schema`
(que é persistente/sincronizado): é tratado como **mensagem de sala** roteada à
mão — exatamente o controle que queríamos.

- `room.onMessage("chat", ...)`: servidor calcula quem está no raio do remetente
  (círculo Euclidiano, `chat_radius` da sala) e faz `client.send("chat", ...)`
  **só** para esses `clients` (incluindo o remetente). Quem está fora não recebe.
- **`nearby`**: a cada tick (ou quando o conjunto muda), o servidor envia a cada
  cliente a lista de quem está no seu raio, para a barra de ouvintes ("+X").

### Mensagens (tipos em `packages/shared`, validados com zod)

Client → Server (`room.send`):
```
move   { dir: 'up'|'down'|'left'|'right', seq }   // intenção
chat   { text }                                   // efêmero
```
Server → Client (`client.send` / state patches):
```
[state patch]  players: MapSchema<PlayerState>     // automático (Colyseus)
init           { ambiente: {meta, art, collision, spawn, chatRadius}, you }  // onJoin
avatar         { id, bits, color, displayName }    // 1x por player ao entrar
nearby         { ids: string[] }                   // quem está no MEU raio agora
chat           { fromId, displayName, text, ts }   // SÓ se em raio; não salvo
correction     { cellX, cellY, seq }               // se a predição divergiu
```

> O join/leave de jogadores é observado pelos clientes via mudanças no
> `MapSchema<PlayerState>` (callbacks `onAdd`/`onRemove` do Colyseus) — não
> precisamos de mensagens `playerJoin/playerLeave` explícitas.

### Escala (motivação da escolha)

- **Vertical primeiro**: um processo Colyseus no free tier ARM aguenta muitas
  salas pequenas.
- **Horizontal depois**: trocar o driver para **Redis** (`RedisPresence` +
  `RedisDriver`) permite **N processos/instâncias** com matchmaking
  compartilhado, sem mudar a lógica de `AmbienteRoom`. Reverse proxy faz o
  sticky/route por sala. A persistência (Postgres) já é externa e compartilhada,
  e o chat é em memória por sala — nada disso impede o scale-out.

---

## 8. Editor de mapa

Canvas com **duas camadas** e duas ferramentas (conforme spec):

1. **Ferramenta de arte** (pinta a bitmap pixel-art):
   - **Lápis** (pixel/traço), **Borracha**, **Balde** (flood fill).
   - Paleta de cores + seletor; zoom/pan; grid opcional.
2. **Ferramenta de colisão** (edita o grid de células 16×16):
   - Pinta/limpa células bloqueadas; overlay semitransparente sobre a arte.
   - Botão para marcar **spawn point**.
3. **Raio de chat (proximidade)** — controle interativo:
   - Slider/stepper que define `chat_radius` (em **células**); mostra o valor
     atual (ex.: "Raio: 5 células ≈ 80px").
   - **Pré-visualização ao vivo**: ao ajustar, desenha o **círculo do raio** sobre
     o mapa (centrado num ponto de exemplo, ex.: o spawn), para o host enxergar o
     alcance real antes de salvar.
   - Persistido em `ambientes.chat_radius` e usado pelo servidor no roteamento.
4. Nome do servidor + **salvar** → cria `server` + `ambiente`.

Decisões de UX: alternância clara entre modos (Arte / Colisão / Raio); undo/redo
(stack de operações); tamanho do mundo configurável (múltiplos de 16).

(*Melhoria*) Colocar **portais** ligando ambientes (modo extra de edição).

---

## 9. Chat efêmero & segurança

### Como ocorre a comunicação (sendo efêmero)

"Efêmero" significa **não persistido** — não significa "não acontece". A
comunicação é **em tempo real, em memória, e some**:

1. Cliente A digita e aperta Enter → envia `chat { text }` pela **WebSocket**.
2. O **servidor** recebe a mensagem **só na RAM** (nunca escreve em DB/disco/log).
   Sanitiza, aplica rate limit e carimba `fromId`/`ts`.
3. O servidor calcula quem está **dentro do raio** de A (proximidade, §abaixo) e
   faz **relay** (`chat {...}`) por WebSocket **apenas** para esses jogadores
   conectados naquele instante (incluindo A).
4. Cada cliente destinatário **renderiza** a mensagem na tela. A referência da
   mensagem no servidor é descartada — não há "tabela de mensagens".

Implicações (por design):
- **Sem histórico**: quem entra na sala **não vê** o que foi dito antes. No
  máximo um **buffer em memória minúsculo por sala** (configurável, default 0 ou
  poucas linhas) para um scrollback curto da sessão atual; descartado quando a
  sala esvazia ou o processo reinicia.
- **Entrega "best-effort" ao vivo**: só quem está **online e em raio** no momento
  recebe. Sem entrega offline, sem "mensagens não lidas".
- **Privacidade**: como nada é gravado, não há o que vazar de um banco; o
  conteúdo existe apenas em trânsito e nas telas de quem estava ouvindo.

> Em resumo: o chat é um **relay de pub/sub em memória, escopado por
> proximidade**, sobre a mesma conexão WebSocket do jogo — não um sistema de
> mensagens armazenadas.

### Princípios de segurança

- **Zero persistência**: mensagens nunca tocam DB nem disco nem logs. No máximo
  um **buffer em memória minúsculo por sala** (configurável, default pequeno ou
  0) só para "scrollback" recente; descartado quando a sala esvazia.
- **Transporte**: somente **WSS/TLS** em produção.
- **Sanitização + rate limit** por conexão; sem eco de conteúdo em logs.
- **Sem PII** nas mensagens além de nome de exibição e avatar.

Camadas de segurança (incremental):
- **Baseline (MVP)**: WSS + sem persistência + sanitização + rate limit.
- **Melhoria — sala E2E opt-in**: chave compartilhada derivada no cliente; o
  servidor só faz relay de **ciphertext**. Trade-off: sem moderação server-side.

### Chat por proximidade (mecânica central)

Só converso com quem está **perto** do meu player. O alcance reforça o caráter
efêmero/seguro: a mensagem nem chega a quem está fora do raio.

- **Raio**: `chat_radius` em **células**, **definido pelo host no editor do
  servidor** (controle interativo com pré-visualização do círculo — ver §8).
  Default sugerido: **5 células** ≈ 80px. **Forma: círculo (distância
  Euclidiana)** — `dx² + dy² ≤ chat_radius²` (decidido), batendo com o preview
  circular do editor.
- **Roteamento autoritativo** (servidor): ao receber um `chat`, calcula os
  jogadores dentro do raio do remetente e relaya **só para eles** (incluindo o
  próprio remetente). Quem está fora **não recebe** a mensagem.
- **Lista de ouvintes (barra inferior)**: o servidor mantém, por jogador, o
  conjunto de quem está no seu raio e emite `nearby` quando muda. O cliente
  renderiza na **parte inferior da tela** as **miniaturas dos avatares** de quem
  está ouvindo.
  - Mostra **até 5** avatares; se houver mais, exibe um indicador **"+X"**
    (ex.: `[a][b][c][d][e] +3`).
  - Atualiza em tempo real conforme jogadores entram/saem do alcance ao andar.
  - Útil como feedback: antes de mandar msg, vejo quem vai me escutar.
- **Feedback visual no mapa** (opcional/melhoria): destacar sutilmente o raio de
  alcance ao redor do meu player, ou os players dentro dele.

> Nota: como o roteamento é por proximidade, não há "broadcast global" de chat —
> cada conjunto de destinatários é calculado por mensagem. O `nearby` evita que
> o cliente precise calcular distância de todos a todos.

### Entrada de teclado no game view (detalhe importante da spec)

> "Qualquer tecla digita no chat; Enter envia. As setas movimentam o jogador."

- **Setas (Arrow keys)**: reservadas para movimento — não digitam no chat.
- **Demais teclas imprimíveis**: vão para o **buffer do chat** (input sempre
  "focado" logicamente, mesmo sem clicar).
- **Enter**: envia a mensagem e limpa o buffer.
- Tratamento cuidadoso de foco para o input não "roubar" as setas e vice-versa
  (handler global de teclado decide o destino por tecla).

---

## 10. Mobile

- Split **vertical** (mapa em cima, chat embaixo).
- **Controles na tela**: **D-pad** (4 direções) sobre/junto ao mapa para mover;
  campo de texto + botão enviar para o chat.
- **Barra de ouvintes** (proximidade) também presente no rodapé, acima do
  teclado/controles — até 5 avatares + "+X".
- Layout responsivo; toques no D-pad emitem as mesmas mensagens `move`.

---

## 11. Melhorias propostas (além do MVP descrito)

| # | Melhoria | Valor |
|---|---|---|
| 1 | **Múltiplos ambientes + portais** ("andar por ambientes" literal) | Mundos maiores, exploração entre salas. Já modelado em §3/§4. |
| 2 | **Chat E2E opt-in por sala** | Reforça o "seguro". §9. |
| 3 | **Presença/lista de online** no game view | Saber quem está na sala. |
| 4 | ~~Chat por proximidade~~ → **agora mecânica central** (§9) | Só falo com quem está perto; barra de ouvintes "+X" no rodapé. |
| 5 | **Preview do mapa** na lista de servidores | Mais atrativo escolher sala. |
| 6 | **Emotes/balões de fala** sobre o avatar no mapa | Liga chat ↔ mundo. |
| 7 | **Editor: undo/redo, zoom, layers nomeadas** | Qualidade de criação. |
| 8 | **Reconexão suave** (retomar posição persistida) | Já temos `player_positions`. |
| 9 | **Limite de jogadores por sala** + fila (matchmaking Colyseus) | Protege o free tier. |
| 11 | **Scale-out** com driver Redis (`RedisPresence`/`RedisDriver`) | Vários processos Colyseus sem reescrever salas (§7). |
| 10 | **Sprite procedural** com mais estilos (paletas temáticas) | Onboarding divertido. |

Sugiro tratar **#1, #3, #5, #8** como parte natural do MVP estendido; o resto
como backlog.

---

## 12. Roadmap / milestones

- **M0 — Fundação** ✅: monorepo (workspaces npm), `shared` (tipos + zod +
  `PlayerState`/`AmbienteState` Schema), ESLint/Prettier, Fastify (`/health`),
  Vite app, **Colyseus** `AmbienteRoom` (join/leave + relay de chat placeholder),
  **Prisma schema** Postgres. (Migration roda quando `DATABASE_URL` estiver
  configurada.) Verificado end-to-end: client conecta, state-sync e chat relay.
- **M1 — Auth & Avatar** ✅: login convidado (JWT) + fluxo Google OAuth
  estruturado (ativa via env); API de avatar (`GET/PUT /avatar/me`); editor
  16×16 monocromático (lápis/borracha/balde + cor única) + gerador aleatório,
  persistindo no Postgres. Verificado end-to-end contra Postgres real.
- **M2 — Servidores & Editor de mapa** ✅: REST de servidores/ambientes
  (`POST /servers`, `GET /servers`, `GET /servers/:id`, `GET /ambientes/:id`);
  editor de mapa em canvas (arte indexada por paleta com lápis/borracha/balde,
  camada de colisão, spawn e slider de raio com preview circular); lista de
  servidores no front. Verificado end-to-end (roundtrip de arte/colisão).
- **M3 — Realtime autoritativo** ✅: `AmbienteRoom` carrega colisão/meta do
  banco, autentica o join por JWT, valida movimento grid-based por tick
  (limites + colisão, com `correction`), persiste posição ao sair e distribui
  avatares; game view no cliente renderiza o mapa + avatares andando com
  interpolação (setas movem). Verificado end-to-end (bloqueio, persistência,
  rejeição de auth).
- **M4 — Chat efêmero + proximidade** ✅: relay de chat só para quem está no raio
  (círculo Euclidiano), cálculo de `nearby` enviado em mudança, barra de ouvintes
  com "+X", miniatura de avatar nas mensagens, handler de teclado (setas movem,
  demais teclas digitam, Enter envia). Verificado: perto recebe, longe não;
  `nearby` atualiza ao andar. (Rate limit fica para o M6.)
- **M5 — Game view & responsivo** ✅: split horizontal no desktop, **split
  vertical + D-pad** no mobile, barra de ouvintes no rodapé, lista de servidores
  com **preview do mapa e presença** (online por servidor via matchMaker).
- **M6 — Melhorias** (em andamento): ✅ balões de fala, ✅ destaque do raio,
  ✅ rate limit de chat, ✅ reconexão com posição salva (do M3); **portais /
  multi-ambiente** (backend + traversal) — ver abaixo; E2E opcional fica como
  backlog.

---

## 13. Perguntas em aberto (para a próxima rodada)

1. ~~Realtime~~ → **Colyseus** (decidido; escala via Redis depois).
2. ~~DB~~ → **PostgreSQL** (decidido, a partir do M0).
3. **Tamanho de mundo**: limite fixo (ex.: 64×64 células = 1024×1024 px) ou
   configurável pelo host? Há limite de banda/armazenamento desejado?
4. **Multi-ambiente** entra no MVP ou fica como fase 2?
8. **Proximidade**: raio configurável pelo host, **forma círculo Euclidiano**
   (decidido). Falta só o valor **default** / limites min–max do slider.
5. **E2E** do chat: MVP ou backlog? (afeta moderação)
6. **Idioma do código/UI**: PT-BR, EN, ou i18n desde o início?
7. **Moderação/abuso**: precisamos de report/ban no MVP, ou só rate limit?

---

## 14. Próximos passos sugeridos

1. Você responde as perguntas da §13 (principalmente realtime e DB).
2. Eu fecho a stack e crio o **M0** (scaffold do monorepo + `shared` + schema).
3. Seguimos milestone a milestone.
