# Talkhub Pixel UI — Design System Contract

A chunky, retro, pixel-art design system for Talkhub. Import primitives from the
barrel; the CSS loads automatically as a side effect (and `main.tsx` also imports
it globally).

```ts
import { PixelButton, PixelPanel, PixelInput } from "./ui";
```

All primitives:

- Are dependency-free (React 18 only), `forwardRef`, and TypeScript strict.
- Accept and **merge** an incoming `className` (appended after the base classes)
  and `style` (passed straight to the DOM node) so callers can position them.
- Forward all remaining native props (`onClick`, `disabled`, `value`, `title`, …).
- Use **no `border-radius`** — the pixel bevel is faked with layered `box-shadow`.

---

## Palette (hex)

### Surfaces

| Token              | Hex       | Use                          |
| ------------------ | --------- | ---------------------------- |
| `--c-bg`           | `#1f1633` | App background (night sky)   |
| `--c-bg-2`         | `#2a1f47` | Secondary backdrop / hover   |
| `--c-panel`        | `#3a2d5c` | Default panel fill           |
| `--c-panel-raised` | `#4a3a72` | Raised panel / default btn   |
| `--c-panel-inset`  | `#281e44` | Inset panel / input field    |

### Text

| Token           | Hex       | Use                  |
| --------------- | --------- | -------------------- |
| `--c-ink`       | `#f4ecd8` | Primary text         |
| `--c-ink-dim`   | `#b9add0` | Secondary / muted    |
| `--c-ink-faint` | `#7d6fa3` | Placeholder / hint   |

### Borders / bevels

| Token             | Hex       | Use                          |
| ----------------- | --------- | ---------------------------- |
| `--c-border`      | `#120c22` | Hard outer pixel border      |
| `--c-bevel-light` | `#6a5896` | Top/left highlight           |
| `--c-bevel-dark`  | `#160f2b` | Bottom/right shade           |

### Brand & accents

| Token              | Hex       | Use                        |
| ------------------ | --------- | -------------------------- |
| `--c-primary`      | `#f9c22e` | Sunny gold — primary CTA   |
| `--c-primary-ink`  | `#2a1f06` | Text on primary            |
| `--c-primary-deep` | `#c8941a` | Primary pressed shade      |
| `--c-accent`       | `#ff5d8f` | Hot pink (selection)       |
| `--c-accent-2`     | `#36d6c3` | Teal (links, focus ring)   |
| `--c-danger`       | `#ff5247` | Destructive red            |
| `--c-danger-ink`   | `#fff2f0` | Text on danger             |
| `--c-danger-deep`  | `#c0271e` | Danger pressed shade       |

### Status (badges)

| Token        | Hex       | Tone     |
| ------------ | --------- | -------- |
| `--c-online` | `#5ce06b` | `online` |
| `--c-info`   | `#5db8ff` | `info`   |
| `--c-warn`   | `#ffb02e` | `warn`   |
| `--c-muted`  | `#6c5f8e` | `muted`  |

---

## Fonts (loaded via Google Fonts in `index.html`)

- **Display** (`--font-display`): `"Press Start 2P"` — headings, buttons, badges,
  panel titles. Dense; keep sizes small.
- **Body** (`--font-body`): `"VT323"` (fallback `"Silkscreen"`) — paragraphs,
  inputs, selects. Renders small, so base size is bumped to ~20px.

Text stays anti-aliased. Only `canvas`, `img.pixelated`, and `.pixelated` get
`image-rendering: pixelated` so pixel-art maps/avatars stay crisp.

### Useful token scales

- Spacing (8px grid): `--sp-1`=4 `--sp-2`=8 `--sp-3`=12 `--sp-4`=16 `--sp-5`=24
  `--sp-6`=32 `--sp-7`=48
- Body font sizes: `--fs-xs`..`--fs-xl` (14→30px)
- Display font sizes: `--fs-d-sm`..`--fs-d-xl` (10→26px)
- `--bw`=3px border, `--bevel`=4px drop offset, `--tap`=40px min tap target

---

## Primitives — props + examples

### `PixelButton`

```ts
type PixelButtonVariant = "primary" | "default" | "ghost" | "danger";
type PixelButtonSize = "sm" | "md";
interface PixelButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: PixelButtonVariant; // default "default"
  size?: PixelButtonSize;       // default "md"
}
```

Defaults `type="button"`. Tactile: presses down into its bevel on `:active`.

```tsx
<PixelButton variant="primary" onClick={save}>Salvar</PixelButton>
<PixelButton variant="danger" size="sm">Sair</PixelButton>
<PixelButton variant="ghost" disabled>Cancelar</PixelButton>
```

### `PixelIconButton`

```ts
interface PixelIconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: PixelButtonVariant; // default "default"
  size?: PixelButtonSize;       // default "md"
}
```

Square 40×40 button for icons/emoji. Defaults `type="button"`.

```tsx
<PixelIconButton title="Emoji" onClick={openPicker}>😀</PixelIconButton>
```

### `PixelPanel`

```ts
type PixelPanelTone = "default" | "raised" | "inset";
interface PixelPanelProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode; // optional title bar (overrides native string title)
  tone?: PixelPanelTone;   // default "default"
}
```

```tsx
<PixelPanel title="Ambientes" tone="raised">
  <p>Escolha um servidor…</p>
</PixelPanel>
```

### `PixelInput`

```ts
interface PixelInputProps extends React.InputHTMLAttributes<HTMLInputElement> {}
```

Defaults `type="text"`. Forwards `value`, `onChange`, `placeholder`, etc.

```tsx
<PixelInput
  placeholder="Seu nome"
  value={name}
  onChange={(e) => setName(e.target.value)}
/>
```

### `PixelSelect`

```ts
interface PixelSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}
```

Children are `<option>`s. Custom pixel chevron.

```tsx
<PixelSelect value={map} onChange={(e) => setMap(e.target.value)}>
  <option value="plaza">Praça</option>
  <option value="cave">Caverna</option>
</PixelSelect>
```

### `PixelBadge`

```ts
type PixelBadgeTone = "online" | "muted" | "info" | "warn";
interface PixelBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: PixelBadgeTone; // default "muted"
}
```

```tsx
<PixelBadge tone="online">online</PixelBadge>
<PixelBadge tone="info">3 jogadores</PixelBadge>
```

### `PixelHeading`

```ts
type PixelHeadingAs = "h1" | "h2" | "h3";
interface PixelHeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
  as?: PixelHeadingAs; // default "h2"
}
```

Renders the matching tag in the display font with a hard pixel text-shadow.

```tsx
<PixelHeading as="h1">Talkhub</PixelHeading>
```

### `PixelToolbar`

```ts
interface PixelToolbarProps extends React.HTMLAttributes<HTMLDivElement> {}
```

Flex row, wraps, consistent `--sp-2` gap. Group buttons/controls.

```tsx
<PixelToolbar>
  <PixelButton size="sm">⬆</PixelButton>
  <PixelButton size="sm">⬇</PixelButton>
  <PixelInput placeholder="Mensagem…" />
  <PixelButton variant="primary" size="sm">Enviar</PixelButton>
</PixelToolbar>
```

---

## CSS utility classes (in `ui/pixel.css`)

Use the primitives instead of raw classes where possible, but the classes are
available for custom elements:

| Class                                                | Purpose                                  |
| ---------------------------------------------------- | ---------------------------------------- |
| `.px-btn`                                             | Base button                              |
| `.px-btn--primary` `--default` `--ghost` `--danger`  | Button variants                          |
| `.px-btn--sm` `.px-btn--md`                          | Button sizes                             |
| `.px-iconbtn`                                         | Square icon-button modifier              |
| `.px-panel`                                           | Base panel                               |
| `.px-panel--default` `--raised` `--inset`            | Panel tones                              |
| `.px-panel__title`                                   | Panel title bar                          |
| `.px-field`                                           | Shared input/select field look           |
| `.px-input`                                           | Text input marker                        |
| `.px-select`                                          | Select (custom chevron)                  |
| `.px-badge`                                           | Base badge                               |
| `.px-badge--online` `--muted` `--info` `--warn`      | Badge tones                              |
| `.px-badge__dot`                                      | Optional leading status dot              |
| `.px-heading` + `--h1` `--h2` `--h3`                 | Display headings                         |
| `.px-toolbar`                                         | Flex row group                           |
| `.pixelated`                                          | Force crisp pixel rendering on an `img`  |

Design tokens live in `ui/theme.css` as `:root` CSS variables — reuse them
(`var(--sp-4)`, `var(--c-primary)`, …) instead of hard-coding values.
