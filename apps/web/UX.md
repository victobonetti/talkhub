# Talkhub — Pixel-Game Redesign Spec (UX.md)

> A screen-by-screen re-skin spec. This is a **re-skin, not a rewrite**: every
> handler, API call, canvas render loop, and editing tool stays exactly as-is.
> Implementers swap raw HTML for design-system primitives and apply the retro
> rules below — they do **not** touch game logic.
>
> Scope of files referenced: `src/App.tsx` (Shell, Login, ServerList +
> ServerPreview, ManageServer, PortalForm), `src/GameView.tsx`,
> `src/AvatarEditor.tsx`, `src/MapEditor.tsx`, `src/api.ts`.

---

## 0. Global design language

### 0.1 Primitives (assume they exist)
`PixelButton(variant=primary|default|ghost|danger, size=sm|md)`,
`PixelPanel(title?, tone=default|raised|inset)`, `PixelInput`, `PixelSelect`,
`PixelBadge(tone=online|muted|info|warn)`, `PixelHeading(as=h1|h2|h3)`,
`PixelIconButton`, `PixelToolbar`. Plus a retro palette and pixel fonts.

### 0.2 Visual rules (non-negotiable)
- **No `border-radius` anywhere.** Every rounded corner in the current code
  (`borderRadius: 8/6/4/3`) becomes a square corner. Chunky borders only.
- **Borders are chunky:** 2px solid for inset elements, 3–4px for panels/cards,
  using palette ink (`--px-ink`, a near-black) rather than `#ccc/#ddd/#eee`.
- **Two fonts:**
  - *Display/pixel font* — headings (`PixelHeading`), button labels, badges,
    toolbar labels, the brand wordmark, numeric HUD bits.
  - *Readable body font* — anything long or live: **chat messages**, **chat
    bubbles over the canvas**, **player name labels on canvas**, microcopy
    paragraphs, error text. Pixel fonts are illegible at small sizes for live
    text — keep these readable.
- **Canvases stay crisp:** never remove `imageRendering: "pixelated"`. Keep
  `ctx.imageSmoothingEnabled = false` in the GameView draw loop. Do not wrap a
  canvas in anything that applies a CSS transform/filter that would resample it.
- **Color tokens (reference by name; design system owns exact hex):**
  `--px-bg` (parchment/dark base), `--px-panel`, `--px-ink`, `--px-accent`
  (primary action), `--px-online` (green), `--px-muted`, `--px-danger`,
  `--px-info` (the blue used for the chat radius). The canvas "empty" cell value
  `0` must keep rendering as a light neutral (today `240`/`245`) so maps read
  the same — **do not change pixel byte→color math in any canvas loop.**

### 0.3 Motion (performance-safe, never touches the rAF game loop)
- **Button press:** translate down 2px + remove a 2px bottom "shadow" border on
  `:active`, giving a physical key-press. CSS only.
- **Hover:** 1px lift or border-color shift to `--px-accent`. CSS only.
- **Idle ambiance:** at most ONE subtle looping accent per screen (e.g. a 2-frame
  blink on the brand sprite, ~1s, `steps()` easing). Must be pure CSS keyframes,
  `prefers-reduced-motion` aware, and **never** mounted over the game canvas.
- **Forbidden:** any JS-driven animation, `setInterval` repaint, layout
  animation, or DOM mutation inside or adjacent to GameView's
  `requestAnimationFrame` draw. The players canvas owns the frame budget.

### 0.4 Accessibility baseline (applies to every screen)
- **Focus:** visible 2px `--px-accent` focus ring (offset, square). Never rely on
  color alone. Logical tab order top→bottom, left→right.
- **Tap targets:** ≥ 44×44px on touch. The mobile DPad buttons (currently 52px)
  and any `size=sm` button used on mobile must meet this.
- **Contrast:** body/labels ≥ 4.5:1, large headings ≥ 3:1 against their panel.
  The current `#777/#888/#999/#aaa` greys must map to a `--px-muted` token that
  passes 4.5:1 on the chosen background.
- **Keyboard preservation (critical):** GameView's `window` keydown listener
  (arrow keys → move) and the chat input's Enter-to-send must keep working
  byte-for-byte. Do not add global key handlers, focus traps, or `keydown`
  stopPropagation that would swallow arrows/Enter.

### 0.5 Do / Don't (global)
- **Do** replace raw `<button>/<input>/<select>/<h2>` with the matching primitive
  and delete the inline `style` objects they carried.
- **Do** keep all Portuguese-BR copy; improve wording where noted, stay playful
  but clear.
- **Don't** add border-radius, gradients-as-decoration (the MapEditor checker
  background is functional — keep it), drop shadows that blur, or web-font
  pixel text for chat/long content.
- **Don't** rename props, change `View` state shape, or reorder API calls.

---

## 1. Shell + global header

### Current
`Shell` (`App.tsx` L429): `<main>` sans-serif, padding 24, maxWidth 900, `<h1>Talkhub</h1>`.
Header (L66): "Olá, **name** (kind)" + "Sair" button.

### Redesign — layout
- **Shell** becomes a full-bleed `--px-bg` page with a centered column
  (max 960px). Keep the 24px padding feel but use a chunky-bordered content area
  on desktop; edge-to-edge with 16px gutters on mobile.
- **Brand bar (top, full width):** `PixelHeading as=h1` wordmark "Talkhub" with a
  small 16×16 pixel mascot sprite to its left (CSS sprite, the only idle
  animation allowed here — a slow 2-frame blink). Wordmark in display font.
- **User strip (right of brand on desktop, second row on mobile):**
  - Avatar thumb (reuse the existing 16×16 avatar render at 24px,
    `imageRendering: pixelated`) + `Olá, <strong>{displayName}</strong>` +
    `PixelBadge` showing `{kind}` (tone=`info` for google, `muted` for guest).
  - `PixelButton variant=ghost size=sm` "Sair".
- **Mobile (<768px):** brand row, then user strip wraps to its own row;
  everything stacks, full width.

### States
- **Loading** (`App.tsx` L56, currently `"Carregando…"`): center a `PixelPanel
  tone=inset` with an animated-by-`steps()` "loading dots" using the display
  font: **"Carregando o mundo…"**. No spinner blur.

### Copy
- Keep "Talkhub", "Olá,", "Sair". Badge text: `convidado` / `google` (lowercase
  pixel badge) instead of raw `(guest)`.

### A11y / motion
- Brand mascot blink respects `prefers-reduced-motion`.
- "Sair" is last in tab order of the header.

---

## 2. Login (`App.tsx` L383)

### Current
maxWidth 360 column: `<h2>Entrar no Talkhub</h2>`, name `<input>`, "Entrar como
convidado" button, then either Google `<a>` or the unavailable note.

### Redesign — layout
- A single centered `PixelPanel tone=raised title="Entrar no Talkhub"`,
  ~360px wide desktop, full-width-minus-gutters on mobile. This is the "title
  card" of the game — give it the most decorative chunky frame.
- Inside, vertical stack (gap ~12):
  1. `PixelInput` — placeholder **"Seu nome (opcional)"**, bound to `name`.
  2. `PixelButton variant=primary size=md` — **"Entrar como convidado"**
     (full width). Disabled while `busy`; label swaps to **"Entrando…"** when
     `busy` (currently no busy label — add it).
  3. A thin "ou" divider (display font, muted) — purely visual.
  4. Google: render the existing `<a href={googleLoginHref()}>` **styled as a
     `PixelButton variant=default`** (it must remain an anchor for the OAuth
     redirect — apply button classes to the `<a>`, do not convert to a real
     button). Label **"Entrar com Google"**, optionally a Google glyph as a
     pixel icon. When unavailable, show a `PixelPanel tone=inset` muted note.

### States
- **Google unavailable** (existing branch): muted note copy may improve to
  **"Login Google indisponível no momento — você ainda pode entrar como
  convidado."** (keeps it reassuring; the original mentioned server config — keep
  a shortened version for ops clarity only if desired, but user-facing should be
  the friendly line).
- **Error:** `loginGuest` currently has no catch UI. Add an inline
  `PixelBadge tone=warn` / small muted line **"Não deu para entrar — tente de
  novo."** rendered only if a guest-login attempt rejects. (Wrap the existing
  `guest()` in try/catch UI **without** changing the call itself — purely additive
  display state.)

### A11y / motion
- Tab order: name input → convidado button → Google link.
- Enter inside the name input should trigger the convidado action (additive
  `onKeyDown`; do not interfere with anything global — Login has no game keys).
- Button press feedback per §0.3.

---

## 3. ServerList (`App.tsx` L125) + ServerPreview (L207)

### Current
Two top buttons ("+ Criar servidor", "Editar avatar"), `<h2>Servidores ativos</h2>`,
then a responsive grid of clickable `<li>` cards: map preview canvas, name,
"por {ownerName}", "● {playerCount} online · {ambienteCount} ambiente(s)", and a
"⚙ Gerenciar" button.

### Redesign — layout
- **Action toolbar:** wrap the two top buttons in a `PixelToolbar`:
  - `PixelButton variant=primary` **"+ Criar servidor"**.
  - `PixelButton variant=default` **"Editar avatar"** (consider a pencil pixel
    icon via `PixelIconButton`+label on desktop).
- **Section title:** `PixelHeading as=h2` **"Servidores ativos"**.
- **Grid:** keep the existing CSS grid (`auto-fill, minmax(220px,1fr)`, gap 12).
  Each card becomes a `PixelPanel tone=raised` (square corners, chunky border),
  still the whole-card click target calling `onEnter(s.firstAmbienteId)`.
  Card contents top→bottom:
  - **ServerPreview canvas** (see below).
  - `PixelHeading as=h3` server name.
  - Muted line **"por {ownerName}"** (body font).
  - **Online status as a `PixelBadge`:** tone=`online` when `playerCount>0`,
    else tone=`muted`. Text **"{playerCount} online · {ambienteCount}
    ambiente(s)"**. Keep the leading dot only inside the online tone.
  - `PixelButton variant=ghost size=sm` **"⚙ Gerenciar"** — keep
    `e.stopPropagation()` so it doesn't trigger the card's enter.
- **Hover:** card border shifts to `--px-accent` + 1px lift (CSS). Cursor stays
  pointer.
- **Mobile (<768px):** grid collapses to 1 column. Cards full width. Keep the
  preview at a fixed pixel height (see ServerPreview). Toolbar buttons stack and
  go full width, ≥44px tall.

### ServerPreview (canvas) — keep behavior, re-skin frame only
- The `getAmbiente` fetch + `putImageData` loop stays **identical** (do not
  change byte→color math; empty cell `0`→`240` neutral must remain).
- Frame: replace `border:1px #eee` + `borderRadius:4` with a 2px `--px-ink`
  square border, background `--px-panel`. Keep `width:100%`, fixed `height:90`,
  `objectFit:contain`, `imageRendering:pixelated`.

### States
- **Loading** (`servers === null`): replace `<p>Carregando…</p>` with 3–4
  skeleton `PixelPanel tone=inset` placeholder cards (square, shimmer via a
  `steps()` CSS sweep, reduced-motion → static). Copy under them optional:
  muted **"Procurando mundos…"**.
- **Empty** (`servers.length === 0`): a centered `PixelPanel tone=inset` with the
  mascot sprite and copy **"Nenhum mundo por aqui ainda. Crie o primeiro!"**
  plus a `PixelButton variant=primary` **"+ Criar servidor"** (calls `onCreate`).
  (Improves on the bare `<p>`.)
- **Fetch error** (`.catch(() => setServers([]))` currently collapses to empty):
  keep the existing behavior, but render the empty-state copy with an extra muted
  line **"(não consegui carregar agora — recarregue a página)"** when you can
  distinguish error from truly-empty. If you cannot distinguish without changing
  the catch, leave the empty state as-is — **do not alter the catch.**

### A11y
- Card is keyboard-activatable: add `role="button"` + `tabIndex=0` + Enter/Space
  handler that mirrors the existing onClick. "⚙ Gerenciar" is a real focusable
  button after the card in tab order.

---

## 4. AvatarEditor (`AvatarEditor.tsx`)

> The 16×16 painter grid is a **functional pixel surface** — keep its exact DOM
> (256 `<div>` cells, `onPointerDown`/`onPointerEnter`, `touchAction:none`,
> `userSelect:none`, `painting` ref, the `pointerup` window listener). Re-skin the
> frame and the right-hand controls only.

### Current
Two-column flex-wrap: left = grid (CELL=22, 1px border), right = tools (Lápis /
Borracha / Balde), color `<input type=color>`, "Gerar aleatório", "Limpar",
"Salvar avatar" (blue), status msg. Reached via the `avatar` view which also has
a "← Voltar" + `<h2>Seu personagem (16×16)</h2>`.

### Redesign — layout
- **Back + title:** in `App.tsx` avatar section, `PixelButton variant=ghost
  size=sm` **"← Voltar"** then `PixelHeading as=h2` **"Seu personagem (16×16)"**,
  arranged like ManageServer's header row.
- **Canvas/grid frame:** wrap the 256-cell grid in a `PixelPanel tone=inset` with
  a 3px `--px-ink` border. Keep the cell grid lines (the `inset 0 0 0 0.5px #eee`
  shadow) but darken to a faint `--px-ink` at low alpha so the grid reads on the
  parchment bg. **Empty cell** stays the light neutral (`#fafafa`→token). Do not
  change CELL math or the painted color logic (`pixels[i] ? color : empty`).
- **Tools as a `PixelToolbar`:** the three tool buttons become `PixelButton`s
  with the **active tool = `variant=primary`** (replaces the `fontWeight:700` +
  `#e0ecff` active styling). Labels keep **"Lápis" / "Borracha" / "Balde"**.
  Add a pixel glyph per tool if available (pencil/eraser/bucket) via
  `PixelIconButton`.
- **Color:** keep `<input type="color">` (native, required) but present it inside
  a `PixelPanel tone=raised` swatch frame; label **"Cor"** in display font. The
  swatch frame shows the current color as a chunky square.
- **Right column actions** (`PixelButton`s, full width of the column):
  - `variant=default` **"Gerar aleatório"** (→ `randomAvatarPixels()`).
  - `variant=default` **"Limpar"** (→ blank). Consider a quick inline confirm
    micro-state ("Limpar tudo?") since it's destructive — optional, additive
    only.
  - `variant=primary` **"Salvar avatar"** / **"Salvando…"** while `saving`
    (keep existing disabled-while-saving).

### States
- **Initial load:** `getAvatar()` may hydrate pixels/color — no spinner needed
  (instant), but if you want, show the grid in a muted "inset" tone until the
  effect resolves. Keep additive only.
- **Saved:** the `msg` "Avatar salvo!" becomes a `PixelBadge tone=online`
  **"Avatar salvo!"** that fades after ~2s (CSS opacity, `steps()`,
  reduced-motion → instant, then no removal logic change).
- **Error:** `msg` "Erro ao salvar." → `PixelBadge tone=warn`
  **"Não deu para salvar — tente de novo."**

### A11y / motion
- Each grid cell is decorative-interactive; expose the editor's net result via an
  `aria-label` on the grid container (e.g. "Editor de avatar 16 por 16"). Do not
  put 256 cells in the tab order — keep them pointer-only as today; provide the
  tool/color/action buttons as the keyboard path.
- Tap targets: tool/action buttons ≥44px on mobile. Grid cells stay 22px (pointer
  painting is intentional, not a tap target).
- Button press feedback per §0.3. No animation over the grid while painting.
- **Mobile (<768px):** grid on top, controls below in a single column; keep
  `touchAction:none` so painting doesn't scroll the page.

---

## 5. MapEditor (`MapEditor.tsx`)

> The art canvas + overlay canvas (grid/collision/spawn/radius), the `applyAt`
> pointer math, flood fill, buffer resize effect, and the checker background are
> **functional** — preserve all of it. Re-skin the chrome (toolbars, inputs,
> palette, save bar).

### Current
Reached via `create` view with `<h2>` "Criar servidor"/"Adicionar ambiente".
Top row: ← Voltar, optional server-name input, ambiente-name input, L/H number
inputs, px readout. Mode row: Arte/Colisão/Spawn/Raio + (for art/collision)
Lápis/Borracha/Balde. Palette row (art mode) with swatches + add-color. Radius
slider (radius mode). Stacked art+overlay canvases. Save bar (blue button + msg).

### Redesign — layout
- **Title:** the `App.tsx` create section uses `PixelHeading as=h2`
  **"Criar servidor"** or **"Adicionar ambiente"** (keep the conditional).
- **Header `PixelToolbar` (row 1 — meta):**
  - `PixelButton variant=ghost size=sm` **"← Voltar"** (`onCancel`).
  - `PixelInput` **"Nome do servidor"** (only when `!serverId`).
  - `PixelInput` **"Nome do ambiente"** (default "Lobby").
  - **L** and **A** as labeled `PixelInput type=number` (keep `clampCells`
    min/max). Improve labels to **"Larg."** and **"Alt."** with the unit readout
    `({wpx}×{hpx}px)` as a `PixelBadge tone=muted`.
- **Mode `PixelToolbar` (row 2):** Arte / Colisão / Spawn / Raio as `PixelButton`s,
  **active = variant=primary** (replaces fontWeight/`#e0ecff`). Then, only for
  art/collision, the tool buttons **Lápis / Borracha / Balde** (Balde only in art,
  per existing `tools` memo) — active tool = `variant=primary`. Group tools
  visually distinct from modes (a divider or a nested `PixelToolbar tone`).
- **Palette row (art mode):** keep swatch buttons but as chunky 24px squares with
  a 2px `--px-ink` border; **selected swatch = 3px `--px-accent` border**
  (replaces `#2563eb`). Keep the `<input type="color">` "add color" — frame it
  and give it a `+` pixel-icon affordance; keep `title="Adicionar cor"`.
- **Radius row (radius mode):** keep the native `<input type=range>` (re-skin
  track/thumb to chunky squares via the design system) with the live label
  **"Raio: {chatRadius} células (≈ {chatRadius*CELL_SIZE}px)"**.
- **Canvas stack:** keep the absolute-positioned art+overlay exactly. Wrap in a
  `PixelPanel tone=inset` frame. **Keep the checker `repeating-conic-gradient`
  background** on the art canvas (it signals transparency — functional). Keep
  `cursor:crosshair` on the overlay.
- **Save bar:** `PixelButton variant=primary` **"Salvar servidor"** /
  **"Adicionar ambiente"** / **"Salvando…"** (keep conditional + disabled).

### States
- **Validation/error** (`msg`): the existing red messages
  ("Dê um nome ao servidor.", "Erro ao salvar (verifique os campos).") render as
  `PixelBadge tone=warn` / `tone=danger` inline next to Save. Keep the exact
  trigger logic.
- **Empty canvas** is the normal start — no special empty state.

### A11y / motion
- Mode and tool toolbars are radio-group-like: add `aria-pressed` to the active
  buttons. Tab order: meta row → mode row → tool row → palette → canvas controls
  → Save.
- The painting canvas is pointer-driven (like the avatar grid); provide all
  parameters via keyboard-reachable controls. Number inputs honor min/max.
- **Mobile (<768px):** all toolbars wrap (they already `flexWrap`). Inputs go
  full width. The canvas may exceed viewport — allow horizontal scroll within the
  inset panel; do not shrink-resample the canvas (keep `scale` math and
  `imageRendering:pixelated`). Buttons ≥44px.
- No motion over the editing canvases.

---

## 6. ManageServer + PortalForm (`App.tsx` L259 / L312)

### Current
Header: ← Voltar + `<h2>Gerenciar servidor</h2>`. `<h3>Ambientes</h3>` list of
`<li>` cards ("name (w×h) · raio R" + "Entrar"). "+ Adicionar ambiente". If ≥2
ambientes → PortalForm (De/Para selects, célula x/y, spawn x/y, "Criar portal" +
msg); else muted hint to add a second ambiente.

### Redesign — ManageServer layout
- **Header row:** `PixelButton variant=ghost size=sm` **"← Voltar"** +
  `PixelHeading as=h2` **"Gerenciar servidor"**.
- **Ambientes section** in a `PixelPanel tone=raised title="Ambientes"`:
  - Each ambiente is a compact `PixelPanel tone=inset` row: bold name (display
    font), then a `PixelBadge tone=muted` **"{wCells}×{hCells}"** and a
    `PixelBadge tone=info` **"raio {chatRadius}"**, with a right-aligned
    `PixelButton variant=primary size=sm` **"Entrar"** (`onEnter(a.id)`).
  - `PixelButton variant=default` **"+ Adicionar ambiente"** below the list
    (`onAddAmbiente`).
- **Mobile:** rows stack; "Entrar" goes full width under the badges, ≥44px.

### Redesign — PortalForm layout (shown when ≥2 ambientes)
- Wrap in `PixelPanel tone=raised title="Criar portal"`.
- Two labeled lines, each becoming a tidy field group:
  - **De:** `PixelSelect` (from) + **"na célula"** `PixelInput type=number` x and
    y (keep `num()` clamp). Improve label to **"Sai de"** for clarity.
  - **Para:** `PixelSelect` (to) + **"chega em (spawn)"** `PixelInput type=number`
    x and y. Improve label to **"Chega em"**.
- `PixelButton variant=primary` **"Criar portal"** (`create`).
- **Result `msg`:** "Portal criado!" → `PixelBadge tone=online`; "Erro ao criar
  portal." → `PixelBadge tone=danger`. Keep exact triggers.

### States
- **< 2 ambientes** (existing muted `<p>`): render as `PixelPanel tone=inset`
  muted: **"Adicione um segundo ambiente para criar portais entre eles."**
- **Ambientes loading** (`ambientes === null`): the list is empty during fetch —
  add a single muted skeleton row **"Carregando ambientes…"** (additive; do not
  change the `reload()`/`getServer` flow).

### A11y
- Selects and number inputs are real form controls — keep native semantics.
- Tab order: ← Voltar → (each Entrar) → + Adicionar → portal De select → célula
  x/y → Para select → spawn x/y → Criar portal.

---

## 7. GameView (`GameView.tsx`) — the in-world screen

> **Highest-risk screen. Touch zero game logic.** Preserve: the Colyseus
> join/leave effect, all `room.onMessage` handlers, the map `putImageData`
> effect, the **global `keydown` arrow→`sendMove` listener**, the entire
> `requestAnimationFrame` players-draw loop (interpolation, chat-radius circle,
> avatar sprites, name labels, speech bubbles), `scale`/`vw`/`isMobile` math,
> `send()` Enter handling, the DPad, and `AvatarThumb`. **Re-skin only the
> surrounding DOM chrome (HUD bar, listeners bar, chat panel frame, input,
> DPad button skins).**

### 7.1 Layout
Desktop: a top **HUD bar**, then a two-column row — left = map stack + listeners
bar (+ DPad on mobile), right = chat. Mobile (<768px, existing `flexDirection`
switch): everything stacks; chat is a fixed 280px-tall panel under the map; DPad
shows under the listeners bar.

### 7.2 HUD bar (currently L329 — "← Sair", status, hint)
- Make it a `PixelPanel tone=raised` HUD strip spanning the top:
  - `PixelButton variant=ghost size=sm` **"← Sair"** (`onExit`).
  - **Connection status** as a `PixelBadge`: `conectando…`→tone=`warn`,
    `conectado`→tone=`online`, `erro: …`→tone=`danger`. Keep the exact `status`
    string source; just choose tone by prefix. (Improve "conectando…" →
    **"conectando ao mundo…"** is allowed since it's display-only.)
  - **Controls hint** in body font, muted: **"setas = andar · digite e Enter =
    falar"** (keep). On mobile, shorten to **"toque no D-pad · Enter = falar"**.

### 7.3 Map stack (L345)
- Keep the two stacked canvases and their exact `width/height/scale`,
  `position:absolute`, `imageRendering:pixelated`. Replace the map canvas
  `border:1px #ccc` with a chunky **3px `--px-ink`** square "screen bezel"; wrap
  the relative container in a `PixelPanel tone=inset` so the world looks like a
  game-cabinet screen. **Do not** add padding that shifts canvas coordinates used
  by pointer math (GameView map has no pointer math, but keep the canvas box exact
  for layout predictability).
- The blue chat-radius circle drawn in the loop is unchanged — its color matches
  `--px-info`; do not redraw it from DOM.

### 7.4 Listeners / "Ouvindo" bar (L365)
- Re-skin into a `PixelToolbar tone=inset`, min-height kept (~26px → bump to fit
  44px-friendly thumbs on mobile):
  - Label **"Ouvindo:"** in display font, muted.
  - Empty: **"ninguém por perto"** as `PixelBadge tone=muted` (replaces grey
    span).
  - Otherwise the existing `AvatarThumb`s (keep 22px; they're
    `imageRendering:pixelated` canvases — frame each in a 2px square border).
  - `+{extra}` overflow stays, rendered as `PixelBadge tone=info` **"+{extra}"**.
- This bar communicates "who hears you" — keep it directly under the map so the
  proximity metaphor is obvious.

### 7.5 DPad (mobile, L68)
- Keep the 3-col grid layout and the `onPointerDown press(dir)` → `onMove`
  handlers **exactly** (this is movement input). Re-skin each button:
  square (no `borderRadius:8`), chunky 3px `--px-ink` border, `--px-panel` fill,
  arrow glyph in display font, **press feedback per §0.3** (translate-down on
  `:active`). Keep `touchAction:none`. Bump to ≥52px (already ≥44 ✓). Center
  under the map as today.

### 7.6 Chat panel (L377)
- Outer frame: `PixelPanel tone=raised`, `flex:1`, `minWidth:260`, height
  matching `hpx*scale` desktop / 280 mobile (keep existing height logic).
- **Message log** (the scrollable inner div): keep `overflowY:auto`, replace
  `border:1px #ddd`+`borderRadius:6` with a `tone=inset` square frame. Each
  message keeps `AvatarThumb` (frame it 1–2px square) + **"{displayName}:"** in
  display font + message **text in the readable body font** (chat must stay
  legible). Keep the `messages.slice(-49)` cap and key logic untouched.
- **Chat input** (L408): `PixelInput`, keep `autoFocus`, `value=draft`,
  `onChange`, and the **`onKeyDown` Enter→`send()`** exactly (do not add
  stopPropagation; arrows must still bubble to the window mover even while the
  input is focused — verify this behavior is preserved). Placeholder may improve
  to **"Fala algo… (só quem está no seu raio recebe)"** (keep the radius
  explanation). Optionally add a `PixelButton variant=primary size=sm` **"Enviar"**
  to the right of the input for touch users that calls the same `send()`; mobile
  only, additive, must not change focus/Enter behavior.

### 7.7 Speech bubbles & name labels (canvas-drawn, L289/L294)
- These are drawn in the rAF loop with `ctx.fillText` in a sans font — **leave the
  drawing code as-is** (it's already the readable body style). Do **not** try to
  render them as DOM overlays; that would risk the frame budget and the
  arrow-key/Enter flow. If the design system wants bubble colors to match
  (`--px-ink` text, `--px-panel` fill, `--px-ink` border), that is a small
  constant swap **inside the existing draw calls only** — still no new DOM, no new
  timers (the `Date.now()+4000` expiry stays).

### 7.8 States
- **Connecting:** HUD badge `warn` "conectando ao mundo…"; map panel can show a
  `tone=inset` muted overlay **"Entrando no ambiente…"** that is removed once
  `status==="conectado"` (additive DOM sibling of the canvas, never over it while
  drawing — place it before `meta` resolves; once canvases mount, drop it).
- **Error** (`status` starts with "erro:"): HUD badge `danger`; show a
  `PixelPanel tone=inset` in the map column with the raw error line + a
  `PixelButton variant=default` **"← Voltar"** (`onExit`). Keep the original
  error string for debugging.
- **Empty chat:** show a one-line muted hint inside the log
  **"Ninguém falou ainda. Chegue perto de alguém e diga oi!"** when
  `messages.length === 0` (additive render branch; does not change message state).
- **No one nearby:** already handled by "ninguém por perto" in the listeners bar.

### 7.9 A11y / motion (GameView-specific, critical)
- **Keyboard:** the global arrow-keys mover and chat-input Enter are sacred. Do
  not introduce focus traps, modal overlays that capture keys, or
  `e.stopPropagation()` on keydown anywhere in the chat input. Tab order: ← Sair →
  chat input (→ optional Enviar) → DPad (mobile). Arrows intentionally are NOT a
  tab mechanism here — they move the avatar globally.
- **Reduced motion:** the canvas interpolation is gameplay, keep it; but any CSS
  HUD/idle decoration must honor `prefers-reduced-motion`.
- **Contrast:** HUD/listeners labels use `--px-muted` that passes 4.5:1; chat text
  uses `--px-ink` on `--px-panel`.
- **Tap targets:** DPad ≥52px ✓; "Enviar" (if added) ≥44px; "← Sair" ≥44px on
  mobile.
- **No DOM churn near the loop:** do not mount React state that re-renders every
  frame; the existing refs/raf own animation. New chrome must be static or
  CSS-animated only.

---

## 8. Cross-screen Do / Don't (implementer cheat-sheet)

**Do**
- Swap raw elements → primitives, delete the inline `style` they carried, keep all
  handlers/props/state names.
- Keep every canvas's `imageRendering:pixelated`, byte→color math, and the
  MapEditor checker background.
- Map "active" UI states to `variant=primary` / `aria-pressed`, not bare font
  weight + pastel fill.
- Map grey microcopy → `--px-muted` (contrast-checked) and status `msg`/`status`
  → `PixelBadge` tones (online/warn/danger/info).
- Keep Portuguese-BR; improve only display-only strings as noted; add
  busy/empty/error copy that's playful but clear.

**Don't**
- Add `border-radius`, blur shadows, or pixel-font for chat/bubbles/long text.
- Touch GameView's rAF loop, the global arrow-key listener, the chat Enter
  handler, the Colyseus join/leave effect, or any `room.send/onMessage`.
- Change `View` state shape, prop names, API call order, or the editors' pointer
  math / buffers / flood fill.
- Add global key handlers or focus traps that could swallow arrows/Enter.
- Render canvas-drawn bubbles/labels as DOM, or add per-frame React state.
