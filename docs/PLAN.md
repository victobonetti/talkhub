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
│  └─ shared/         # Tipos, schemas (zod), protocolo WS, constantes
├─ docs/
└─ ...
```

- **Front-end**: SPA React. Renderização do mundo e avatares em `<canvas>`
  (2D ou PixiJS). Editores (avatar e mapa) também em canvas.
- **Back-end**: um único processo Node responsável por:
  - REST: auth, CRUD de servidores/mapas, avatar.
  - WebSocket: game loop autoritativo por sala + relay de chat efêmero.
- **shared**: definições `zod`/TypeScript usadas pelos dois lados — **uma única
  definição** do protocolo, sem divergência client/server.

### Stack recomendada (revisável)

| Camada | Escolha | Por quê |
|---|---|---|
| Front | React + Vite + TypeScript | Rápido, ecossistema, build estático servível por qualquer reverse proxy. |
| Render | Canvas 2D (evoluir p/ PixiJS se precisar) | Pixel-art não precisa de GPU pesada no MVP. |
| Estado client | Zustand | Leve, sem boilerplate. |
| Back HTTP | Fastify | Performático, TS-first, leve em ARM. |
| Realtime | `ws` (WebSocket cru) + game loop próprio **ou** Colyseus | Autoritativo. Colyseus já traz salas/sincronização de estado; `ws` dá controle total. Ver §7. |
| DB | PostgreSQL (Prisma ou Drizzle) | Robusto; SQLite é alternativa válida p/ começar. Roda bem no free tier. |
| Auth | Google OAuth 2.0 (OIDC) + JWT próprio p/ sessão e guest | Sem dependência de auth gerenciado. |

> Tudo escolhido para rodar num único host ARM atrás de um reverse proxy com
> TLS (ex.: Caddy) servindo `web` estático e fazendo proxy de `/api` e `/ws`.

---

## 3. Conceitos de domínio

- **User**: conta Google **ou** guest. Tem um **Avatar** (sprite 16×16).
- **Avatar**: sprite pixel-art 16×16 RGBA, criado no editor ou gerado
  proceduralmente. Persistido e vinculado ao user.
- **Server (Hub)**: criado por um host. Tem nome e um ou mais **Ambientes**.
- **Ambiente (Room/Map)**: um mundo pixel-art explorável. Contém:
  - **Camada de arte**: bitmap pixel-art (decorativo).
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
  art           bytea            -- bitmap pixel-art (PNG comprimido)
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

## 7. Protocolo realtime (WebSocket, servidor autoritativo)

### Loop e salas

- Uma **sala por ambiente**. Servidor mantém em memória: jogadores conectados,
  posição (célula), avatar id e timestamp.
- **Movimento grid-based**: cliente envia *intenção* de mover numa direção; o
  servidor valida (adjacência, limites, colisão) e, se válido, aplica e
  **broadcasta** a nova posição. Cliente nunca decide sua própria posição final.
- **Tick / broadcast**: estado de movimento agregado e enviado em ticks
  (ex.: 10–15 Hz) para economizar banda; chat é enviado imediatamente (relay).
- **Reconciliação**: cliente faz *predição* otimista do passo e corrige se o
  servidor divergir (raro em grid-based). Interpolação suaviza o render.
- **Proximidade (autoritativa)**: como o servidor já conhece todas as posições,
  ele é a autoridade sobre **quem ouve quem**. Cada mensagem só é entregue aos
  jogadores dentro do raio do remetente, e cada cliente recebe a lista de quem
  está no seu alcance (ver §9). Cliente nunca recebe msg de quem está longe.

### Mensagens (definidas em `packages/shared`, validadas com zod)

Client → Server:
```
join        { ambienteId }
move        { dir: 'up'|'down'|'left'|'right', seq }   // intenção
chat        { text }                                   // efêmero
ping        {}
```
Server → Client:
```
joined      { you, ambiente: {meta, art, collision, spawn}, players[] }
state       { players: [{ id, cellX, cellY, dir }], serverTick }  // por tick
playerJoin  { id, displayName, avatarRef, cellX, cellY }
playerLeave { id }
nearby      { ids: string[] }   // quem está no MEU raio agora (delta ok)
chat        { fromId, displayName, avatarRef, text, ts }  // SÓ se em raio; não salvo
correction  { cellX, cellY, seq }                         // se predição divergiu
pong        {}
```

> **Roteamento por proximidade**: o servidor calcula, por jogador, o conjunto de
> jogadores dentro do raio `CHAT_RADIUS` (distância em células — ver §9) e:
> 1. relaya cada `chat` **apenas** para os destinatários em raio do remetente;
> 2. emite `nearby` quando esse conjunto muda (entrou/saiu alguém do alcance),
>    para alimentar a barra inferior de "quem está ouvindo".

> **`ws` cru + loop próprio** dá controle total e footprint mínimo (preferido
> para o free tier). **Colyseus** é a alternativa se quisermos sincronização de
> estado/salas prontas — decisão a confirmar antes de codar o servidor.

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

Princípios:

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
  Default sugerido: **5 células** ≈ 80px. Distância de **Chebyshev** (quadrado)
  ou **Euclidiana** (círculo) — recomendo círculo (Euclidiana) por ser mais
  intuitivo e bater com o preview circular do editor. A definir no §13.
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
| 9 | **Limite de jogadores por sala** + fila | Protege o free tier. |
| 10 | **Sprite procedural** com mais estilos (paletas temáticas) | Onboarding divertido. |

Sugiro tratar **#1, #3, #5, #8** como parte natural do MVP estendido; o resto
como backlog.

---

## 12. Roadmap / milestones

- **M0 — Fundação**: monorepo, `shared` (tipos + protocolo zod), lint/format,
  Fastify hello, Vite app, schema DB + migrations.
- **M1 — Auth & Avatar**: Google OAuth + guest; editor 16×16 + gerador
  aleatório; persistir avatar.
- **M2 — Servidores & Editor de mapa**: CRUD de servidor/ambiente; editor de
  arte (lápis/borracha/balde) + editor de colisão + spawn; salvar/carregar.
- **M3 — Realtime autoritativo**: WS, salas, join, movimento grid-based
  validado, broadcast por tick, interpolação no cliente.
- **M4 — Chat efêmero + proximidade**: relay seguro **por raio**, cálculo de
  `nearby`, barra de ouvintes ("+X"), miniatura de avatar, handler de teclado
  (setas vs. digitação), rate limit.
- **M5 — Game view & responsivo**: split 50/50 desktop, split vertical + D-pad
  mobile, barra de ouvintes no rodapé, lista de servidores com preview e
  presença.
- **M6 — Melhorias**: portais/multi-ambiente, reconexão com posição salva,
  (opcional) E2E, balões de fala e destaque de raio.

---

## 13. Perguntas em aberto (para a próxima rodada)

1. **Realtime**: `ws` cru (controle/footprint) **ou** Colyseus (produtividade)?
2. **DB**: PostgreSQL **ou** SQLite para começar (menos infra no free tier)?
3. **Tamanho de mundo**: limite fixo (ex.: 64×64 células = 1024×1024 px) ou
   configurável pelo host? Há limite de banda/armazenamento desejado?
4. **Multi-ambiente** entra no MVP ou fica como fase 2?
8. **Proximidade**: raio é configurável pelo host no editor (decidido). Falta:
   forma (círculo Euclidiano vs. quadrado Chebyshev) e o valor **default** /
   limites min–max do slider.
5. **E2E** do chat: MVP ou backlog? (afeta moderação)
6. **Idioma do código/UI**: PT-BR, EN, ou i18n desde o início?
7. **Moderação/abuso**: precisamos de report/ban no MVP, ou só rate limit?

---

## 14. Próximos passos sugeridos

1. Você responde as perguntas da §13 (principalmente realtime e DB).
2. Eu fecho a stack e crio o **M0** (scaffold do monorepo + `shared` + schema).
3. Seguimos milestone a milestone.
