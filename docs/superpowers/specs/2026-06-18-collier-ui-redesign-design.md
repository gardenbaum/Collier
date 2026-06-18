# Collier — UI Redesign Design Spec

**Date**: 2026-06-18
**Status**: Draft, awaiting user approval
**Scope**: Complete UI redesign of the Collier desktop app (Tauri v2, React 19)

## Problem Statement

The current Collier UI is visually inconsistent and lacks a coherent brand identity. Two design systems are in active conflict:

1. **Bauhaus + Swiss tokens** (`src/lib/design-tokens.ts`) — mono scale 0–9, `radius: 0`, accent `#c2410c` reserved for P0/destructive. Defined and used correctly in `IssueListView`, `FilterSidebar`, `LabelListView`, `Welcome`, `RepoSelection`, and the four badge components.
2. **shadcn/ui defaults** — `rounded-xl`, OKLCH neutral palette, default borders. Used in `TitleBar`, `ViewTabs`, `PreferencesDialog`, `CommandPalette`, `IssueDetailDrawer`, and all 39 primitives in `src/components/ui/`.

Concrete defects visible in the running app:

- The in-app title bar shows **"Tauri App"** instead of "Collier" (`src/components/titlebar/TitleBarContent.tsx:117` default).
- The app icon (`src-tauri/icons/icon.png`, `public/Icon.svg`, `public/favicon.svg`) is **blue** (`#3B82F6 → #1E40AF`) but the design system says accent is **orange** (`#c2410c`).
- The main view's three-panel layout (filters | tabs+view | labels) reads as a busy 1-5-2 column split with heavy gray borders.
- `ViewTabs` uses shadcn-style rounded buttons over a light gray background — clashes with the hard-edged `FilterSidebar` to its left.
- `PreferencesDialog` renders inside `rounded-xl` with shadcn's sidebar pattern — completely disconnected from the in-app aesthetic.
- `IssueDetailDrawer` uses `shadow-xl` and a gray `bg-background` — a floating sheet that doesn't feel like part of the app.
- Status colors all live in the gray mono range; priority colors (except P0) are indistinguishable.

## Decisions (from brainstorming)

| #   | Question                  | Answer                                                         |
| --- | ------------------------- | -------------------------------------------------------------- |
| 1   | Visual direction          | **B** — Dark Dev-Power (Linear / Raycast aesthetic)            |
| 2   | Layout structure          | **X** — Consolidated sidebar (Linear-like, 1 rail)             |
| 3   | Accent color & brand mark | **2** — Linear Purple `#5e6ad2` + Gradient "C" monogram        |
| 4   | Cross-platform behavior   | **macOS-first** — Vibrancy native on macOS, solid on Win/Linux |
| 5   | Scope                     | **Vollständig** — every UI component gets redesigned           |

## Goals

1. Establish a **single coherent visual language** applied across every component.
2. Fix the **brand identity**: app icon, favicon, in-app title, monogram mark.
3. Replace the shadcn default look with a **dark, translucent, macOS-style** shell while keeping all functionality intact.
4. Reorganize the main layout to a **single consolidated sidebar** (Views + Filters + Labels) with the main view taking the remaining width.
5. Keep **all existing tests green** and pass `bun run check:all` (typecheck, lint, format, ast-grep, clippy, vitest).

## Non-Goals

- No new features. No new views. No new Tauri commands. No new dependencies.
- No data model changes. No Rust changes except bundling the new icon assets.
- No migration of the user's existing preferences, recent repos, or `.beads` data.
- No Linux-specific vibrancy (Mutter blur is out of scope).
- No Windows-specific Mica/Acrylic (deferred; macOS-first per decision #4).
- The Quick Pane window is **out of scope** for the visual redesign (its 1-line `text-input` UI stays shadcn-default — a separate ticket if desired).

## Design System

### Brand Identity

**Wordmark**: "Collier" — `font-weight: 600`, letter-spacing `-0.01em`, color `--foreground`.

**Monogram (the "C")**: 22×22 rounded square (radius 5) with a vertical gradient `#5e6ad2 → #7c3aed`, white "C" rendered in `font-weight: 700`, `font-size: 13px`, `SF Pro Display`. Renders in the title bar, as the app icon, and as a 16×16 mark in tight UI spots.

**App icon**: regenerate `src-tauri/icons/*.png` + `src-tauri/icons/icon.icns` + `src-tauri/icons/icon.ico` from a new `src-tauri/icons/icon.svg` source. The icon is a 1024×1024 rounded square (radius ~225, i.e. macOS Big Sur squircle approximation) filled with the vertical `#5e6ad2 → #7c3aed` gradient, white "C" centered. No image pattern, no inner shadows — flat geometric mark.

**Favicon**: same mark at 32×32 (`public/favicon.svg`).

### Tokens

`src/lib/design-tokens.ts` is **rewritten**. The mono-only Bauhaus palette is replaced with a modern dark palette anchored on `#0a0a0a` background. A separate `src/lib/design-tokens.ts` will export both the legacy `colors.mono*` constants (kept as aliases for the few components that still use them — `IssueListView`, `FilterSidebar`, `LabelListView` — until they're ported) and the new `palette` object.

```ts
// src/lib/design-tokens.ts (new)

export const palette = {
  // Surface scale (dark first — dark is the default)
  bg: '#0a0a0a', // window background
  surface: '#141414', // cards, list rows
  surfaceAlt: '#1a1a1a', // hover, active
  surfaceHigh: '#262626', // pressed, focused row
  border: 'rgba(255, 255, 255, 0.08)',
  borderStrong: 'rgba(255, 255, 255, 0.14)',

  // Text scale
  textPrimary: '#fafafa',
  textSecondary: '#d4d4d4',
  textMuted: '#a3a3a3',
  textDisabled: '#737373',

  // Brand
  accent: '#5e6ad2', // Linear purple — primary actions, focus
  accentHover: '#7080e0',
  accentActive: '#4d59c0',
  accentText: '#ffffff',
  accentMuted: 'rgba(94, 106, 210, 0.18)', // selected row bg

  // Semantic
  success: '#22c55e',
  warning: '#fb923c',
  danger: '#ef4444', // P0 priority + destructive only
  info: '#5e6ad2', // = accent

  // Status (issue pipeline)
  statusOpen: '#a3a3a3',
  statusInProgress: '#5e6ad2',
  statusBlocked: '#fb923c',
  statusClosed: '#525252',
  statusDeferred: '#737373',

  // Priority (P0 only is danger; the rest walk a mono scale)
  priorityP0: '#ef4444',
  priorityP1: '#fafafa',
  priorityP2: '#d4d4d4',
  priorityP3: '#a3a3a3',
  priorityP4: '#737373',
} as const

export const radius = {
  xs: 4, // tags, small chips
  sm: 6, // buttons, inputs, list items
  md: 8, // cards, popovers
  lg: 10, // main panels (sidebar, content area)
  xl: 12, // modals, sheets
  '2xl': 16,
  full: 9999,
} as const

export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  6: 24,
  8: 32,
  12: 48,
  16: 64,
  24: 96,
} as const

export const type = {
  fontFamily: {
    sans: '-apple-system, "SF Pro Display", "Inter", system-ui, sans-serif',
    mono: '"SF Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  fontWeight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
  fontSize: {
    xs: 11, // mono IDs, micro labels
    sm: 12, // secondary UI
    base: 13, // body
    md: 14, // default for tables
    lg: 16, // section heads
    xl: 20, // page titles
    '2xl': 28,
    '3xl': 40,
  },
  lineHeight: { tight: 1.2, normal: 1.5, loose: 1.7 },
  letterSpacing: {
    tight: '-0.01em',
    normal: '0',
    wide: '0.04em',
    caps: '0.08em', // section labels (FILTERS, LABELS)
  },
} as const

export const shadow = {
  // macOS-style layered shadows
  sm: '0 1px 0 rgba(0, 0, 0, 0.2), 0 1px 2px rgba(0, 0, 0, 0.16)',
  md: '0 1px 0 rgba(0, 0, 0, 0.2), 0 4px 12px rgba(0, 0, 0, 0.24)',
  lg: '0 1px 0 rgba(0, 0, 0, 0.2), 0 8px 24px rgba(0, 0, 0, 0.32)',
  xl: '0 1px 0 rgba(0, 0, 0, 0.3), 0 16px 48px rgba(0, 0, 0, 0.4)',
  focus: '0 0 0 2px rgba(94, 106, 210, 0.5)',
} as const

export const motion = {
  duration: { fast: 80, normal: 140, slow: 220, sheet: 280 },
  easing: {
    standard: 'cubic-bezier(0.2, 0, 0, 1)',
    decel: 'cubic-bezier(0, 0, 0.2, 1)',
    accel: 'cubic-bezier(0.4, 0, 1, 1)',
  },
} as const

// macOS-only: when the OS supports it, the panels adopt vibrancy.
// Detection happens in CSS via `@supports (backdrop-filter: blur(20px))`.
// On Linux/Windows, surfaces use `surfaceAlt` solid instead.
export const vibrancy = {
  sidebar: 'rgba(20, 20, 20, 0.72)',
  popover: 'rgba(26, 26, 26, 0.82)',
  modal: 'rgba(20, 20, 20, 0.88)',
  titleBar: 'rgba(20, 20, 20, 0.6)',
  drawer: 'rgba(20, 20, 20, 0.92)',
} as const
```

The `colors` export stays as a legacy alias (a re-export of the relevant `palette` keys) so any consumer still importing `colors.mono9` etc. doesn't break in this PR. A follow-up cleanup can remove it.

### CSS Variables & Tailwind v4

`src/theme-variables.css` is rewritten in two blocks (`:root` for dark — the new default — and `.light` for an opt-in light theme), exposing the same token names to both Tailwind v4 and shadcn's `bg-background` / `text-foreground` machinery.

```css
/* :root = dark, the new default */
:root {
  --background: #0a0a0a;
  --foreground: #fafafa;
  --card: #141414;
  --card-foreground: #fafafa;
  --popover: #1a1a1a;
  --popover-foreground: #fafafa;
  --primary: #5e6ad2; /* accent */
  --primary-foreground: #ffffff;
  --secondary: #1a1a1a;
  --secondary-foreground: #fafafa;
  --muted: #1a1a1a;
  --muted-foreground: #a3a3a3;
  --accent: #5e6ad2;
  --accent-foreground: #ffffff;
  --destructive: #ef4444; /* danger */
  --destructive-foreground: #ffffff;
  --border: rgba(255, 255, 255, 0.08);
  --input: rgba(255, 255, 255, 0.08);
  --ring: #5e6ad2;
  --radius: 0.5rem; /* 8px */
  --sidebar: rgba(20, 20, 20, 0.72);
  --sidebar-foreground: #fafafa;
  --sidebar-primary: #5e6ad2;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: rgba(255, 255, 255, 0.08);
  --sidebar-accent-foreground: #fafafa;
  --sidebar-border: rgba(255, 255, 255, 0.08);
  --sidebar-ring: #5e6ad2;
}

/* .light — opt-in light theme (the existing light/dark toggle still works) */
.light {
  --background: #fafafa;
  --foreground: #0a0a0a;
  --card: #ffffff;
  --card-foreground: #0a0a0a;
  /* ...mirrored... */
  --border: rgba(0, 0, 0, 0.08);
}

@supports (backdrop-filter: blur(20px)) {
  :root {
    --sidebar-bg: rgba(20, 20, 20, 0.72);
    --popover-bg: rgba(26, 26, 26, 0.82);
    --modal-bg: rgba(20, 20, 20, 0.88);
  }
  .light {
    --sidebar-bg: rgba(245, 245, 247, 0.78);
    --popover-bg: rgba(255, 255, 255, 0.85);
    --modal-bg: rgba(255, 255, 255, 0.92);
  }
}
```

The `@layer base` in `src/App.css` keeps the desktop defaults (`user-select: none` on body, `user-select: text` on inputs, `overscroll-behavior: none`, drag-region attribute) but the universal `* { cursor: default; }` is unchanged. The `--app-corner-radius: 12px` on `:root` is kept — windows still have the macOS rounded corners.

### Typography

- System font stack with SF Pro as the macOS default, Inter as the fallback. `useSquareCornersEffect` becomes `useSquareCornersEffect` (already in place) — the **app window** keeps its rounded corners; the design **inside** is square-edged.
- Section labels (`Filters`, `Views`, `Labels`) render in **uppercase, letter-spacing 0.08em, font-size 10px, color `textMuted`, font-weight semibold** — the Linear-style "section header" pattern.
- Mono (`SF Mono`) is used only for: issue IDs (`Collier-abc`), paths (`/Users/...`), bd command output, and priority tokens (`P0`).
- Body text is 13px, line-height 1.5.

## Component Library

### Strategy

The 39 shadcn primitives in `src/components/ui/` are **not** rewritten from scratch. They are **overridden in place** so every consumer (CommandPalette, PreferencesDialog, IssueDetailDrawer, all panes) gets the new look without a per-call rewrite.

`components.json` stays on `style: "new-york"` (the shadcn config), but the actual implementations in `src/components/ui/button.tsx`, `dialog.tsx`, `popover.tsx`, `dropdown-menu.tsx`, `input.tsx`, `select.tsx`, `switch.tsx`, `checkbox.tsx`, `tooltip.tsx`, `sidebar.tsx`, `command.tsx`, `sheet.tsx`, `card.tsx`, `badge.tsx`, `alert.tsx`, `alert-dialog.tsx`, `breadcrumb.tsx`, `field.tsx`, `item.tsx`, `kbd.tsx`, `separator.tsx`, `skeleton.tsx`, `sonner.tsx`, `spinner.tsx`, `tag-input.tsx`, `textarea.tsx`, `toggle.tsx`, `toggle-group.tsx`, `calendar.tsx`, `date-picker.tsx`, `input-group.tsx`, `native-select.tsx`, `popover.tsx`, `radio-group.tsx`, `scroll-area.tsx`, `resizable.tsx` get a **mechanical pass**:

- Replace `rounded-md` / `rounded-lg` / `rounded-xl` → `rounded-[var(--radius)]` (the new `--radius: 0.5rem`).
- Replace `border-border` → `border-[color:var(--border)]` (the new low-opacity border).
- Replace `bg-background` / `bg-card` / `bg-popover` with the new tokens via `bg-[var(--card)]` etc., and add `backdrop-blur-xl` to popovers, dialogs, and the command palette.
- Replace `shadow-md` / `shadow-lg` / `shadow-xl` with the new shadow scale.
- Update `Button` variants: `default` becomes the accent; `secondary` becomes `surfaceAlt`; `ghost` becomes fully transparent; `destructive` stays red. Add a `subtle` variant (transparent → surfaceAlt on hover).
- `focus-visible:ring-ring` becomes `focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--background)]`.

The shadcn `Sidebar` primitive in `src/components/ui/sidebar.tsx` is the basis for the new consolidated sidebar (Layout section below). Its default `rounded-xl` is dropped, its `bg-sidebar` becomes `bg-[var(--sidebar-bg)]` with `backdrop-blur-xl`.

### Reusable atoms (new in `src/components/atoms/`)

A new `src/components/atoms/` folder holds the few custom atoms the design needs that don't exist in shadcn:

- `Monogram.tsx` — the gradient "C" mark, size-prop driven (16/20/22/32/64/128/512), used in title bar, app icon rasterization source, and command-palette header.
- `SectionLabel.tsx` — uppercase section header (the `Filters` / `Views` / `Labels` pattern).
- `PriorityBadge.tsx` — replaces inline priority rendering in lists. Variants: `P0` (red, `font-semibold`), `P1` (white), `P2..P4` (descending mono).
- `StatusDot.tsx` — 8px circle in the status color, with `aria-label`.
- `EmptyState.tsx` — a centered empty-state molecule (icon + heading + body + CTA) used by every view's empty path. Centralizes the "Coming in v1.1 — use the CLI for now" pattern currently inline in `EmptyStates.tsx`.

## App Shell

### Title bar (`src/components/titlebar/`)

**Bug fix**: `TitleBarContent.tsx` and `TitleBarTitle.tsx` default `title = 'Tauri App'`. Change to `title = 'Collier'`. The `TitleBar` already passes `t('titlebar.default')` from i18n; the fallback in `useTranslation` returns the key when missing — so the i18n key is the actual fix. Add `titlebar.default: 'Collier'` to `locales/en.json`, `de.json`, `fr.json`, `ar.json`.

**Layout** (single file: `TitleBarContent.tsx` rewritten):

```
┌──────────────────────────────────────────────────────────┐
│  ⊙⊙⊙   ▣  Collier · gardenbaum/collier      ⌘K   ⚙  ⌥▥  │
│        C                                              │
└──────────────────────────────────────────────────────────┘
```

- Left: macOS traffic lights (existing `MacOSWindowControls`).
- Then the 22×22 `Monogram` (new) + "Collier" wordmark in `font-weight: 600`, `color: textPrimary`. On Windows, the monogram is still there — only the traffic lights are platform-conditional.
- Center: a **dynamic breadcrumb** of the active workspace + active view, e.g. `gardenbaum/collier · List`. Replaces the static "Collier" title.
- Right: `⌘K` command-palette hint (new, mono, 10px, `surfaceAlt` chip), Settings (existing), right-sidebar toggle (existing).
- Height bumped from 32px to 38px to fit the 22px monogram with breathing room.
- Background: `bg-[var(--titlebar-bg)]` with `backdrop-blur-xl` on macOS, solid `#141414` on Win/Linux.

### Consolidated sidebar (`src/components/layout/Sidebar.tsx`, replaces `LeftSideBar.tsx`)

**Structural change**: `LeftSideBar` and `RightSideBar` collapse into a single `Sidebar` component. The 10 views (List, Ready, Blocked, Search, Epic, Swarm, Sync, Worktree, Status, Raw) move from a top tab bar into the sidebar as a "Views" section. The label list moves from the right rail into a "Labels" section.

**Wireframe**:

```
┌─────────────────────────────┐
│ ▣ gardenbaum/collier        │  ← workspace switcher (dropdown)
│ ─────────────────────────── │
│ VIEWS                       │  ← SectionLabel
│   List                  142 │
│   Ready                12  │
│   Blocked               3  │
│   Search                   │
│   Epic                     │
│   Swarm                    │
│   Sync                     │
│   Worktree                 │
│   Status                   │
│   Raw                      │
│ ─────────────────────────── │
│ FILTERS                     │  ← SectionLabel
│   Status          ▾ (3)   │
│   Priority        ▾ (1)   │
│   Type            ▾ (0)   │
│ ─────────────────────────── │
│ LABELS                      │  ← SectionLabel
│   ☐ bug              12   │
│   ☐ feature           4   │
│ ─────────────────────────── │
│   ⚙ Preferences             │  ← bottom-pinned
└─────────────────────────────┘
```

- Width: 240px default, 200–320px resizable, collapsible to 0. (The two old sidebars summed to ~480px; the new single rail is 240px — net +240px for the main view, which is a deliberate improvement.)
- Background: `var(--sidebar-bg)` + `backdrop-blur-xl` on macOS, solid `#141414` elsewhere.
- No right border; the main area is separated by a 1px `var(--border)` line.
- Section labels (VIEWS / FILTERS / LABELS) are the `SectionLabel` atom: 10px uppercase, `letter-spacing: 0.08em`, `textMuted`, semibold, 12px top margin, 6px bottom margin.
- List rows (view items, filter groups, labels): 28px height, 8px horizontal padding, 6px corner radius. Active: `bg-[var(--sidebar-accent)]` (white at 0.08). Hover: same. Mono count (`12`) right-aligned in `textMuted` 11px.
- The "Filters" rows are expandable/collapsible (controlled by `useUIStore`). Default state: all expanded.
- The "Workspace" header at the top is a dropdown trigger showing the current repo path. Clicking it opens a Popover with recent repos + "Open folder…" (the existing `RepoSelection` logic, moved into a popover).

**Migration**:

- `LeftSideBar.tsx` deleted; its `FilterSidebar` content is folded into `Sidebar.tsx` as the FILTERS section.
- `RightSideBar.tsx` deleted; its `LabelListView` content is folded into `Sidebar.tsx` as the LABELS section.
- `MainWindow.tsx` layout changes from 3 panels to 2 (Sidebar + Main).
- `ViewTabs.tsx` deleted; `ViewsRouter.tsx` still routes but the active view is now driven by the sidebar click, not a tab.
- `MainWindowContent.tsx` no longer mounts `ViewTabs`; it only mounts `ViewsRouter` + the `IssueDetailDrawer`.

### Main content (`src/components/layout/MainWindowContent.tsx`)

- Width: fills remaining.
- No top tabs. Top of the area is a thin **page header** (40px) showing the current view name in `font-size: 13px`, `font-weight: 600`, plus a context bar with a "new issue" CTA on the right (`Button variant="default"`).
- Below the header: the view itself, full bleed, 24px padding, `bg-bg`.
- Drawer still slides in from the right at 480px width when an issue is selected.

### Issue detail drawer (`src/components/beads/IssueDetailDrawer.tsx`)

- Replaces the current `bg-background shadow-xl` with `bg-[var(--drawer-bg)] backdrop-blur-xl` (or solid `#141414` on Win/Linux).
- Border: 1px `var(--border)` on the left, no shadow (the blur against the list behind gives the depth).
- Slide animation: 280ms `cubic-bezier(0, 0, 0.2, 1)`, ease-out (left: 100% → 0).
- Backdrop: `rgba(0, 0, 0, 0.4)` (kept).
- The `IssueDetailView` body inside gets the new design tokens but the component structure is unchanged.

### Command palette (`src/components/command-palette/CommandPalette.tsx`)

The shadcn `CommandDialog` is the right primitive; it's overridden in `src/components/ui/command.tsx` to use the new radius + shadow + backdrop-blur. Top of the palette gets a 22×22 `Monogram` + "Collier" wordmark (16px to the right) for brand presence.

### Preferences dialog (`src/components/preferences/PreferencesDialog.tsx`)

- The shadcn `DialogContent` is overridden to use the new radius (`xl = 12px`) + `backdrop-blur-xl`.
- The internal `SidebarProvider` for the General/Appearance/Advanced nav becomes a **vertical icon strip** on the left (Linear-style), 56px wide, 3 icons stacked: Settings, Palette, Zap. Active icon has a `surfaceAlt` pill background. No text labels in the strip — the active pane name is shown as a section header in the main area.
- The breadcrumb at the top is removed (the pane name is shown as a section header instead).
- Settings panes themselves (`GeneralPane`, `AppearancePane`, `AdvancedPane`) get a token refresh via the new `--input`, `--border`, `--ring` variables; the structure is unchanged.

### Toaster (`src/components/ui/sonner.tsx` overridden + `MainWindow.tsx`)

- Position: `bottom-right` (kept).
- Toasts: `surface` background, `backdrop-blur-xl`, `radius.lg`, `shadow.lg`, 1px `border`. Top accent stripe: 2px wide, color = toast type (success = green, error = red, info = accent).
- Width: 360px max, 12px text.
- Slide-in: 220ms `cubic-bezier(0, 0, 0.2, 1)` from the right.

### Empty states (`src/components/beads/EmptyStates.tsx`)

The five inline empty states (List, Ready, Blocked, Search, Epic, Swarm, Sync, Worktree, Status, Raw) collapse into the new `EmptyState` atom:

```
              ◯                ← 48px accent-tinted icon
       Nothing here yet
   Issues you create will show up in this list.

            [ + New issue ]    ← primary CTA
```

Width: 360px, centered, 48px top margin. Icon container is 64×64 with `bg-[var(--accent-muted)]`, icon size 24px, `accent` color. Heading: `font-size: 18px`, `font-weight: 600`. Body: `13px`, `textMuted`. CTA: the standard `Button variant="default"`.

## Views (10 in total)

Every view reuses the new main content layout (page header + 24px padded body). The internal data-rendering components (list rows, status pills, priority dots, label chips) keep their semantics but get a visual refresh:

- **`IssueListView`** — replaces the current Bauhaus hard-edge row with a macOS-style row: 32px height, `padding-inline: 12px`, `border-radius: 6px`. Active row: `bg-[var(--surface-alt)]`. Hover: same. The virtualized windowing math stays identical. The `PriorityDot` becomes the new `PriorityBadge` (text `P0`–`P4`, mono font, color from the priority scale). The `StatusPill` keeps its dot+text but loses the border, uses `surfaceAlt` bg. The `LabelChip` keeps its border but gains `radius.xs` (4px) and a subtle hover that copies the label into the clipboard (the existing `useCopyToClipboard` hook).
- **`ReadyView`, `BlockedView`, `SearchView`** — same row design as the list view. `SearchView` gets a redesigned search input in the page header (full-width, with a magnifying-glass icon and an Esc-to-clear hint).
- **`EpicView`, `SwarmView`, `SyncStatusView`, `WorktreeListView`, `StatusOverviewView`** — each gets the new page header and the new `EmptyState` atom. `StatusOverviewView` becomes a **2-column metric card grid** (Open / In Progress / Blocked / Closed counts) using the new `Card` primitive.
- **`RawCommandPanel`** — the developer escape hatch. The input is restyled with the new focus ring; the output area gets `bg-[var(--surface)]`, mono font, 12px, and a 1px `var(--border)` left rail instead of the current shadcn card.

## Motion

- `motion` tokens drive every transition. No more `tw-animate-css` classes — they get removed in favor of hand-rolled `transition-[colors,transform,opacity] duration-[140ms] ease-[cubic-bezier(0.2,0,0,1)]`.
- Sheet/drawer slide-in: 280ms, `cubic-bezier(0, 0, 0.2, 1)`.
- Hover/press: 80ms for color, 140ms for transforms.
- Sidebar collapse: 220ms width animation.
- No bouncing, no springs, no fade-in cascades. The macOS/Linear aesthetic is "calm and quick."

## Accessibility

- All focus rings use the new `--ring` token at 2px width with a 2px `--background` offset (the standard shadcn focus pattern, updated to the new accent).
- Color contrast: every text/background pair meets WCAG AA. `textMuted` on `bg` is checked at 4.5:1 minimum.
- Keyboard navigation in the new Sidebar: roving `tabindex` across the view items (existing `ViewTabs` pattern is lifted into `Sidebar`), arrow-up/down moves focus, Home/End jump to first/last, Enter activates. Same for the filter sections and labels.
- The `prefers-reduced-motion` media query disables sheet slide and sidebar resize animations (transition: none).
- All icons that are purely decorative get `aria-hidden`; the `PriorityBadge` and `StatusDot` expose `aria-label` text.
- The macOS `backdrop-filter` is wrapped in `@supports` so the fallback (`surfaceAlt` solid) is automatic — no JS detection needed.

## Iconography

- App icon: regenerated from a new `src-tauri/icons/icon.svg` (see Brand Identity). The 11 PNG sizes (16, 32, 64, 128, 128@2x, 256, 256@2x, 512, 512@2x, 1024) + `icon.icns` + `icon.ico` are regenerated from this source via `npx @tauri-apps/cli icon` (one command). iOS + Android assets are out of scope (Tauri 2 mobile isn't shipped yet for this app).
- In-app icons: keep the Lucide set. No new icon set. The icon for the `Monogram` is custom SVG.
- `Lucide` icon sizing standardized: 14px in rows, 16px in cards, 18px in dialogs, 24px in the `EmptyState` atom.

## Files Changed (in implementation order)

### Tokens & theme

- `src/lib/design-tokens.ts` — rewrite (keep `colors` as a legacy alias).
- `src/theme-variables.css` — rewrite (dark default, light opt-in, vibrancy via `@supports`).
- `src/App.css` — adjust `--app-corner-radius` to `12px` (kept), confirm `user-select` rules.
- `src/quick-pane.css` — keep current (Quick Pane is out of scope).
- `locales/{en,de,fr,ar}.json` — add `titlebar.default: "Collier"`, `titlebar.workspace: "Workspace"`, `sidebar.sections.{views,filters,labels}`.

### New atoms

- `src/components/atoms/Monogram.tsx` (+ test).
- `src/components/atoms/SectionLabel.tsx` (+ test).
- `src/components/atoms/PriorityBadge.tsx` (+ test).
- `src/components/atoms/StatusDot.tsx` (+ test).
- `src/components/atoms/EmptyState.tsx` (+ test).

### shadcn primitive overrides

- `src/components/ui/button.tsx` — new `subtle` variant; radius / shadow / focus updates.
- `src/components/ui/dialog.tsx`, `popover.tsx`, `sheet.tsx`, `command.tsx`, `dropdown-menu.tsx`, `select.tsx`, `tooltip.tsx`, `alert.tsx`, `alert-dialog.tsx` — radius + shadow + backdrop-blur where applicable.
- `src/components/ui/card.tsx`, `badge.tsx`, `input.tsx`, `textarea.tsx`, `switch.tsx`, `checkbox.tsx`, `radio-group.tsx`, `kbd.tsx`, `separator.tsx`, `skeleton.tsx`, `spinner.tsx`, `sonner.tsx` — radius + border + token refresh.
- `src/components/ui/sidebar.tsx` — backdrop-blur, new radius, new padding.
- `src/components/ui/resizable.tsx` — keep the existing module-load guard from #458e80a; update the handle's visual style to a 1px transparent line + a 4px hover surface (no more 2px gray block).

### Layout & title bar

- `src/components/titlebar/TitleBarContent.tsx` — add Monogram + workspace breadcrumb + ⌘K hint.
- `src/components/titlebar/TitleBar.tsx` — pass workspace context down.
- `src/components/layout/Sidebar.tsx` — new consolidated component.
- `src/components/layout/LeftSideBar.tsx` — **delete**.
- `src/components/layout/RightSideBar.tsx` — **delete**.
- `src/components/layout/MainWindow.tsx` — 2-panel layout.
- `src/components/layout/MainWindowContent.tsx` — remove `ViewTabs`, add page-header pattern.
- `src/components/beads/ViewTabs.tsx` — **delete**.

### Views & overlays

- `src/components/beads/issues/IssueListView.tsx` — refresh row visuals to use new tokens.
- `src/components/beads/issues/FilterSidebar.tsx` — fold into `Sidebar.tsx` as the FILTERS section. The file is kept as a re-export shim (`export { FilterSidebar } from '@/components/layout/Sidebar'`) for one commit, then deleted once the test imports are updated.
- `src/components/beads/labels/LabelListView.tsx` — same pattern: fold into `Sidebar.tsx` as the LABELS section, re-export shim for one commit, then delete.
- `src/components/beads/labels/LabelFilterChip.tsx`, `LabelManager.tsx` — token refresh.
- `src/components/beads/issues/ReadyView.tsx`, `BlockedView.tsx`, `SearchView.tsx` — page-header + new row visuals.
- `src/components/beads/views/EpicView.tsx`, `SwarmView.tsx`, `SyncStatusView.tsx`, `WorktreeListView.tsx`, `StatusOverviewView.tsx` — page-header + new `EmptyState` atom; `StatusOverviewView` becomes a metric-card grid.
- `src/components/beads/raw/RawCommandPanel.tsx` — restyled input + output area.
- `src/components/beads/EmptyStates.tsx` — re-exports from `EmptyState` atom.
- `src/components/beads/IssueDetailDrawer.tsx` — backdrop-blur + new radius + new animation.
- `src/components/command-palette/CommandPalette.tsx` — add `Monogram` + wordmark in the dialog header.
- `src/components/preferences/PreferencesDialog.tsx` — icon-strip nav instead of sidebar nav; remove breadcrumb; new section header in the main area.
- `src/components/preferences/panes/GeneralPane.tsx`, `AppearancePane.tsx`, `AdvancedPane.tsx` — token refresh via overridden primitives; structure unchanged.
- `src/components/preferences/shared/SettingsComponents.tsx` — token refresh.

### Icons

- `src-tauri/icons/icon.svg` — new gradient "C" mark source.
- `src-tauri/icons/*` — regenerated via `npx @tauri-apps/cli icon` (one-shot script).
- `public/favicon.svg` — same mark at 32×32.
- `public/Icon.svg` — delete (was the old blue mark).

### Tests

- New tests for the 5 atoms (~5–10 cases each).
- Update existing tests that assert hard-edged Bauhaus styling (snapshots / className strings) — they switch to the new token expectations.
- `bun run check:all` must pass.

### Documentation

- `docs/developer/ui-patterns.md` — add a "Design system" section documenting the new tokens and the override pattern for shadcn primitives.
- `docs/developer/README.md` — link the new section.
- `docs/developer/architecture-guide.md` — note the consolidated-sidebar pattern in the layout section.

## Risks & Mitigations

| Risk                                                           | Mitigation                                                                                                                                             |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bun run check:all` breaks on the shadcn-override PR           | Mechanical change in 39 files; review each diff in a single commit. Run `check:all` locally before pushing.                                            |
| Tests pinned to old classnames (`rounded-md`, `bg-muted`)      | Find/replace test assertions in the same PR; tests follow the component change, not the other way.                                                     |
| `useSquareCornersEffect` interferes with new radius            | The hook only affects `--app-corner-radius` (the window outline). Component radii are independent — they read `--radius` which is now 0.5rem.          |
| macOS-only vibrancy on Windows users                           | `@supports (backdrop-filter)` makes the fallback automatic. Windows users see solid panels. Per decision #4.                                           |
| Icon rasterization produces visible artifacts on HiDPI         | Use `@tauri-apps/cli icon` which generates all required sizes; verify the 32×32 output before commit.                                                  |
| The consolidated sidebar removes 2 panels — risk of regression | All view-routing logic moves into `Sidebar.tsx` with the same store selectors (`useWorkspaceStore.activeView`). The `ViewsRouter` switch is unchanged. |
| New icon clashes with `.superpowers/` dir or other tools       | `.gitignore` already excludes `.superpowers/`. Verify in `git status` before commit.                                                                   |

## Implementation Plan

The plan is split into 6 implementation phases (each ends with a passing `bun run check:all` and a visual verification step in the dev app). The full plan is created in a separate document by the `writing-plans` skill after this spec is approved.

## Open Questions

None. All design decisions are resolved. The implementation order is the only remaining variable; it is fixed in the implementation plan.

## Success Criteria

1. `bun run check:all` passes.
2. The dev app boots, the new monogram "C" appears in the title bar, the workspace name replaces "Tauri App".
3. The main window has 2 panels (Sidebar + Main). The Sidebar's VIEWS section replaces the old top tabs. The Sidebar's LABELS section replaces the old right rail.
4. Every component is dark by default. Light theme is opt-in via the existing `useTheme` hook.
5. macOS shows real backdrop-blur; Windows/Linux show solid panels.
6. The app icon (in Finder, Dock, Windows Explorer, Linux app menu) is the new purple-gradient "C".
7. No new dependencies. No new Tauri commands. No Rust changes outside icon assets.
