# Design

<!-- impeccable:design-schema 1 -->

## World

A phone-call cockpit, not a generic SaaS dashboard. Deep Oqla-navy commands the frame — the top bar and the live call-script panel — while the data-dense surfaces underneath (kanban board, modals, forms) stay quiet and neutral so they scan fast. One color per job: navy for the app's own chrome and the one moment that matters (the rep mid-call), blue for actions and current selection, green for success/won, all pulled from the real Oqla mark (`src/assets/logo-oqla.png`).

Mode: **Operate**. Internal sales tool, small team (2-10 people), used live on the phone — familiarity and scanability outrank expression. See `PRODUCT.md` for product truth.

## Palette

Defined as CSS custom properties in `src/styles.css` `:root`.

- `--navy` `#0d1b26` / `--navy-2` `#16293a` — app chrome (header, call-script panel). Committed use, not scattered.
- `--blue` `#2d83bd` / `--blue-deep` `#1f5d86` / `--blue-soft` `#eaf3fa` — primary actions, current selection, the "blue" status family.
- `--green` `#1f9d5c` / `--green-soft` `#e6f6ec` — success / won.
- `--red` `#c53d3d` / `--red-soft` `#fbeaea` — destructive / lost.
- `--amber` `#b3790f` / `--amber-soft` `#fbf1dd` — waiting / in-progress.
- `--gray` `#5b6b78` / `--gray-soft` `#edf1f4` — neutral / suspended.
- `--ink` `#101c26`, `--muted` `#5c6b78`, `--faint` `#8695a1` — text.
- `--paper` `#f5f7f8`, `--panel` `#ffffff`, `--sunken` `#eef1f3`, `--line` / `--line-soft` — surfaces and borders.

Color strategy: Restrained everywhere except the header and the active call-script card, which are Committed to navy — the one surface per view that earns it.

## Type

Single family: **Manrope** (400/500/600/700/800), loaded once via Google Fonts. No display/body pairing — Operate mode doesn't need one; weight and size steps carry the hierarchy instead. `h1` 24px/800, `h2` 17px/800, body 14-15px, labels 11-12px uppercase tracked (`letter-spacing: 0.06-0.08em`) for field/status headers.

## Shape & elevation

- Radius scale: `--radius-sm` 8px (buttons, inputs, pills-adjacent), `--radius-md` 12px (cards, boxes), `--radius-lg` 16px (panels, modals).
- Shadow scale: `--shadow-xs` (resting cards) → `--shadow-sm` (hover) → `--shadow-md` (dragging/active) → `--shadow-lg` (modals). All have real offset + blur, never a flat/zero-offset halo.
- No colored `border-left` accents on cards (flagged by the design detector as an AI-slop tell) — use background tint or a leading glyph instead, as in `.script`'s quotation mark.

## Icons

Authored inline SVG, 24×24 viewBox, `stroke="currentColor"` `stroke-width="2"`, round caps/joins — defined once as small components at the top of `src/App.jsx` (`IconCheck`, `IconX`, `IconPencil`, `IconTrash`, `IconChevronLeft`, `IconChevronRight`). No unicode glyphs (✓ ✕ ✎ 🗑 ← →) standing in for icons.

## Components

- **Header**: navy bar, full-bleed (`margin: 0 -24px`), white logo (`filter: brightness(0) invert(1)`), pill badges at low-opacity white, active nav tab gets a solid white pill (`.header-actions .active-nav` — must stay more specific than `.header-actions .secondary` or the override loses the cascade).
- **Status pills / selects**: five semantic tones (`blue`/`green`/`red`/`amber`/`gray`) via a shared `.status-pill`/`.status-select` modifier pattern — reuse these tones for any new status-like UI rather than inventing new colors.
- **Kanban board**: `.board-grid` uses `grid-auto-flow: column` for the horizontal scroll on desktop. Both responsive breakpoints (900px, 600px) must also reset `grid-auto-flow: row`, or the explicit `grid-template-columns` override is ignored and columns keep flowing horizontally off-screen — this is a real bug class, not a style preference.
- **Call-script panel** (`.conversation-shell .card:first-child`): the one navy-on-navy surface in the app. The quoted script line uses a large serif quotation mark (`.script::before`), not a colored left border.
- **Modals**: white panel, `--shadow-lg`, `backdrop-filter: blur(2px)` scrim at `rgba(13,27,38,0.56)`.

## Responsive

Two breakpoints, mobile-first overrides at `900px` and `600px`. Below 600px the header wraps to two rows and hides the Supabase-connection badge (`.cloud-badge`) to avoid crowding; nothing else is hidden.

## Provenance

Built code-led (no image-generation tool available in this environment) directly from the existing React structure — every existing `className` was preserved, so this was a CSS + icon-token pass, not a markup rewrite. Verified with real Chromium screenshots (desktop 1440px and mobile 390px) via a temporary, fully-reverted preview harness, plus a clean pass of `scripts/detect.mjs`.
