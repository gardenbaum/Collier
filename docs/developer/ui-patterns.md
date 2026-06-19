# UI Patterns

## Overview

This app uses a modern CSS stack optimized for Tauri desktop applications:

- **Tailwind CSS v4** with CSS-based configuration
- **shadcn/ui v4** component library
- **OKLCH color space** for perceptually uniform colors
- **Desktop-specific defaults** for native app feel

## Tailwind v4 Configuration

Tailwind v4 uses CSS-based configuration instead of `tailwind.config.js`.

### File Structure

```
src/
├── App.css              # Main window styles + Tailwind imports
├── quick-pane.css       # Quick pane window styles
└── theme-variables.css  # Shared theme variables (colors, radii)
```

**Multi-window theming**: `theme-variables.css` is imported by both `App.css` and `quick-pane.css` so all windows share the same theme tokens. When adding new color variables, add them to `theme-variables.css`.

### Structure

```css
@import 'tailwindcss'; /* Core Tailwind */
@import 'tw-animate-css'; /* Animation utilities */

@custom-variant dark (&:is(.dark *)); /* Dark mode variant */

@theme inline {
  /* Map CSS variables to Tailwind tokens */
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  /* ... */
}

:root {
  /* Light mode values */
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
}

.dark {
  /* Dark mode overrides */
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
}

@layer base {
  /* Global base styles */
}
```

### Key Concepts

| Directive              | Purpose                                              |
| ---------------------- | ---------------------------------------------------- |
| `@theme inline`        | Maps CSS variables to Tailwind's design token system |
| `@custom-variant dark` | Enables `dark:` prefix based on `.dark` class        |
| `@layer base`          | Base styles that apply globally                      |

### Adding Custom Colors

To add a new semantic color:

```css
@theme inline {
  --color-success: var(--success);
  --color-success-foreground: var(--success-foreground);
}

:root {
  --success: oklch(0.7 0.15 145);
  --success-foreground: oklch(1 0 0);
}

.dark {
  --success: oklch(0.6 0.15 145);
  --success-foreground: oklch(1 0 0);
}
```

Then use with Tailwind: `bg-success text-success-foreground`

## Dark Mode

### How It Works

1. **ThemeProvider** (`src/components/ThemeProvider.tsx`) manages theme state
2. Adds `.dark` class to `<html>` element when dark mode is active
3. CSS variables in `.dark` override `:root` values
4. Tailwind's `dark:` variant applies styles conditionally

### Theme Options

- `light` - Force light mode
- `dark` - Force dark mode
- `system` - Follow OS preference (default)

### Using in Components

```tsx
// Access theme in components
import { useTheme } from '@/hooks/use-theme'

function MyComponent() {
  const { theme, setTheme } = useTheme()

  return <button onClick={() => setTheme('dark')}>Current: {theme}</button>
}
```

### Why `.dark` Class (Not `light-dark()`)

This app uses the `.dark` class approach rather than CSS `light-dark()` because:

- Standard pattern for shadcn/ui ecosystem
- JavaScript control over theme switching
- Supports "system" preference detection
- Compatible with all shadcn components

## OKLCH Colors

All colors use the OKLCH color space for perceptual uniformity.

### Format

```css
oklch(lightness chroma hue)
oklch(0.7 0.15 250)  /* L: 0-1, C: 0-0.4, H: 0-360 */
```

### Why OKLCH

- **Perceptually uniform** - Equal steps in values = equal perceived change
- **Wide gamut** - Access to P3 display colors
- **Intuitive** - Lightness is predictable (unlike HSL)

### Color Palette Structure

| Token                                    | Purpose                   |
| ---------------------------------------- | ------------------------- |
| `--background` / `--foreground`          | Page background and text  |
| `--card` / `--card-foreground`           | Card surfaces             |
| `--primary` / `--primary-foreground`     | Primary actions           |
| `--secondary` / `--secondary-foreground` | Secondary actions         |
| `--muted` / `--muted-foreground`         | Subdued elements          |
| `--accent` / `--accent-foreground`       | Highlights                |
| `--destructive`                          | Destructive actions (red) |
| `--border` / `--input` / `--ring`        | Borders and focus rings   |

## Desktop-Specific Styles

The `@layer base` section includes styles that make the app feel native on desktop.

### Text Selection

```css
body {
  user-select: none; /* Disable by default */
}

input,
textarea,
[contenteditable='true'] {
  user-select: text !important; /* Enable in editable areas */
}
```

**Why:** Desktop apps typically don't allow selecting UI text, only content.

### Cursor

```css
* {
  cursor: default; /* Arrow cursor everywhere */
}

input,
textarea {
  cursor: text !important;
}

.cursor-pointer {
  cursor: pointer !important;
}
```

**Why:** Native apps use arrow cursor, not text cursor on labels.

### Scroll Behavior

```css
body {
  overscroll-behavior: none; /* Prevent bounce/refresh */
  overflow: hidden; /* Prevent body scroll */
}
```

**Why:** Prevents pull-to-refresh and elastic scrolling that feels wrong in desktop apps.

### Drag Regions

```css
*[data-tauri-drag-region] {
  -webkit-app-region: drag;
  app-region: drag;
}
```

Apply `data-tauri-drag-region` to elements that should drag the window (like title bars).

## Component Organization

```
src/
├── lib/
│   ├── design-tokens.ts   # TS design tokens (palette, radius, motion, vibrancy, shadow)
│   └── ...
├── theme-variables.css    # CSS custom properties (consumed by Tailwind v4 + shadcn)
├── components/
│   ├── atoms/             # Brand-aware building blocks (Monogram, StatusDot, …)
│   ├── layout/            # App structure (MainWindow, Sidebar, MainWindowContent)
│   ├── titlebar/          # Window chrome
│   ├── ui/                # shadcn primitives (overridden in-place — see below)
│   ├── command-palette/   # Command palette feature
│   ├── preferences/       # Preferences dialog
│   ├── ThemeProvider.tsx
│   └── ErrorBoundary.tsx
```

### Conventions

- **atoms/** - Brand-aware building blocks. Cross-feature, zero app-state.
- **layout/** - Structural components that define app regions
- **titlebar/** - Platform-specific window controls
- **ui/** - shadcn/ui primitives. Mechanical overrides live here (see "shadcn Override Pattern")
- **Feature folders** - Group related components together

## Design System

The design system has three layers. Read top-to-bottom; each layer feeds the one below.

### 1. TypeScript tokens — `src/lib/design-tokens.ts`

The canonical source for design decisions that JS/TS code needs at runtime (inline styles, computed values, exports for tests). Five exports:

| Export     | Purpose                                                                   |
| ---------- | ------------------------------------------------------------------------- |
| `palette`  | Surface/text/brand/semantic colors. Dark-first (`bg: '#0a0a0a'`).         |
| `radius`   | Corner radii in px (`xs: 4` → `2xl: 16`, plus `full: 9999`).              |
| `motion`   | `duration` (fast/normal/slow/sheet) and `easing` (standard/decel/accel).  |
| `vibrancy` | Translucent surfaces for sidebar/popover/modal/titleBar/drawer.           |
| `shadow`   | sm/md/lg/xl + a `focus` ring (mirrors `--ring` for inline-style callers). |

A legacy `colors` export is kept as a compatibility shim for the old Bauhaus mono-only scale; the canonical names are `palette.*`. New code should use `palette.*` and not the legacy alias.

### 2. CSS variables — `src/theme-variables.css`

The bridge between the JS tokens and the CSS world. Tailwind v4 reads these via the `@theme inline` block; shadcn primitives read them by the standard `--background`, `--foreground`, `--radius`, … names; consumers that want a runtime value can use `var(--…)` directly.

Three rules:

1. **Dark is the default.** `:root, .dark { --background: #0a0a0a; … }`. Light is opt-in via a `.light` class on `<html>` (driven by `useTheme()`).
2. **Vibrancy is conditional.** `@supports (backdrop-filter: blur(20px))` overrides the sidebar/popover variables to translucent values. Platforms without backdrop-filter (some Windows / Linux configs) get solid surfaces automatically.
3. **R radii are derived.** `--radius-sm` / `-md` / `-lg` / `-xl` are computed from a single `--radius` base so changing the base cascades.

### 3. Atoms — `src/components/atoms/`

Cross-feature, zero-app-state building blocks. Re-exported from `src/components/atoms/index.ts`:

| Atom            | Purpose                                                                  |
| --------------- | ------------------------------------------------------------------------ |
| `Monogram`      | The 22×22 gradient "C" brand mark (Linear-purple `#5e6ad2` → `#7c3aed`). |
| `SectionLabel`  | All-caps mono section header for sidebar / preferences.                  |
| `PriorityBadge` | Mono-font P0–P4 chip. Danger red for P0, descending for the rest.        |
| `StatusDot`     | 8px semantic color dot per issue status.                                 |
| `EmptyState`    | Icon + heading + body + action for empty views / filters.                |

Atoms never depend on app state, hooks, or `useTranslation` (the one exception is `EmptyState`, which accepts already-translated strings). New atoms go in this folder and get added to the barrel.

## shadcn/ui Usage

### Adding Components

```bash
bunx shadcn@latest add button
bunx shadcn@latest add dialog
```

Components are copied to `src/components/ui/` and can be customized.

### Customizing Components

shadcn components are yours to modify. Common customizations:

```tsx
// src/components/ui/button.tsx
const buttonVariants = cva('...', {
  variants: {
    variant: {
      default: 'bg-primary text-primary-foreground',
      // Add custom variant
      success: 'bg-success text-success-foreground',
    },
  },
})
```

### The shadcn Override Pattern

The standard shadcn primitives are tuned for an OKLCH light-mode default and use hardcoded `rounded-md`, `bg-background`, etc. The override pattern is a **mechanical rewrite** that replaces those literal classes with CSS-variable equivalents so the design system (dark default, single-radius base, semantic tokens) flows through automatically.

Run once after `bunx shadcn@latest add <component>`:

| shadcn literal         | Replace with                     | Why                                         |
| ---------------------- | -------------------------------- | ------------------------------------------- |
| `rounded-md`           | `rounded-[var(--radius)]`        | Honor the single-radius base.               |
| `rounded-lg`           | `rounded-[var(--radius-lg)]`     | Same.                                       |
| `rounded-sm`           | `rounded-[var(--radius-sm)]`     | Same.                                       |
| `bg-background`        | `bg-[color:var(--background)]`   | Honor the dark-default CSS vars.            |
| `bg-popover`           | `bg-[color:var(--popover)]`      | Honor the @supports vibrancy override.      |
| `bg-card`              | `bg-[color:var(--card)]`         | Same.                                       |
| `bg-primary`           | `bg-[color:var(--primary)]`      | Same.                                       |
| `text-foreground`      | `text-[color:var(--foreground)]` | Same.                                       |
| `border-input`         | `border-[color:var(--input)]`    | Same.                                       |
| `border-border`        | `border-[color:var(--border)]`   | Same.                                       |
| `ring-ring`            | `ring-[color:var(--ring)]`       | Honor the brand accent.                     |
| `shadow-lg`            | drop or replace with `shadow-md` | Heavy shadows clash with vibrancy.          |
| `backdrop-blur` (none) | `backdrop-blur-xl`               | Sidebars/popovers/dialogs all get the blur. |

Why mechanical? Because every new shadcn add is the same rewrite, and a missed override is a visible inconsistency (e.g. a light-mode popover on a dark sidebar). If you add a new shadcn component, do the rewrite before merging.

### Available Components

This app includes commonly needed components. Run `bunx shadcn@latest add [component]` to add more from [ui.shadcn.com](https://ui.shadcn.com/docs/components).

## The `cn()` Utility

All components use the `cn()` utility for conditional classes:

```tsx
import { cn } from '@/lib/utils'

function MyComponent({ className, disabled }) {
  return (
    <div
      className={cn(
        'base-styles here',
        disabled && 'opacity-50',
        className // Allow overrides
      )}
    >
      ...
    </div>
  )
}
```

**Pattern:** Always accept `className` prop and merge with `cn()` for flexibility.

## Component Patterns

### Layout Components

Layout components should:

- Accept `children` and `className` props
- Use flexbox with `overflow-hidden` to prevent content bleed
- Not set external margins (let parent control spacing)

```tsx
interface SideBarProps {
  children?: React.ReactNode
  className?: string
}

export function LeftSideBar({ children, className }: SideBarProps) {
  return (
    <div className={cn('flex flex-col h-full overflow-hidden', className)}>
      {children}
    </div>
  )
}
```

### Visibility with CSS

For panels that toggle visibility, prefer CSS over conditional rendering:

```tsx
// Good: Preserves component state
;<ResizablePanel className={cn(!visible && 'hidden')}>
  <SideBar />
</ResizablePanel>

// Avoid: Loses component state on hide/show
{
  visible && <SideBar />
}
```

This preserves scroll position, form state, and resize dimensions.

## Layout Patterns

### Consolidated Sidebar (1 rail, 3 sections)

The main window uses a **2-panel shell** (`Sidebar` + `MainWindowContent`) inside a single horizontal `ResizablePanelGroup`. The Sidebar itself is a single rail that hosts three `<SectionLabel>`-separated sections:

1. **VIEWS** — workspace view switcher (`List`, `Ready`, `Blocked`, `Search`, `Epics`, `Swarm`, `Sync`, `Worktree`, `Status`, `Raw`).
2. **FILTERS** — Status / Priority / Type filter chips with live counts.
3. **LABELS** — labels from the active repo, sorted alphabetically with counts.

```
┌──────────────────────────────────────────────┐
│ TitleBar (Monogram · workspace · ⌘K hint)   │
├──────────┬───────────────────────────────────┤
│ Sidebar  │  PageHeader (active view title)   │
│          ├───────────────────────────────────┤
│ VIEWS    │                                   │
│  List    │                                   │
│  Ready ▸ │          Active View              │
│  …       │                                   │
│          │                                   │
│ FILTERS  │                                   │
│  Status  │                                   │
│  Priorty │                                   │
│  Type    │                                   │
│          │                                   │
│ LABELS   │                                   │
│  bug  12 │                                   │
│  feat  7 │                                   │
└──────────┴───────────────────────────────────┘
```

This replaces the older 3-panel layout (left sidebar / center / right sidebar) where filters and labels lived in their own collapsible rails. The 1-rail-3-sections pattern keeps all navigation reachable from one place, removes a resize handle, and gives the design system a single surface to make translucent (`backdrop-blur-xl` + `@supports` vibrancy).

**Where it lives:** `src/components/layout/Sidebar.tsx`. **State sources:** `useWorkspaceStore.activeView` (VIEWS), `useIssueFilterStore` (FILTERS), `useQuery({ queryKey: ['beads', 'labels', repoPath] })` (LABELS).

**Adding a new section:** append a `<SectionLabel>` + `<ul>` block to `Sidebar.tsx`. Keep the existing `gap-0.5`, `h-7`, `rounded-[var(--radius)]` button pattern so row heights and radii stay consistent with the rest of the rail.

### Page Header

The main content area starts with a single-row `<header data-testid="page-header">` that shows the active view's title and a context-appropriate action (currently only the "New issue" button on `list` and `ready` views). It replaces the old `ViewTabs` row, which was a duplicate navigation affordance once the Sidebar had a Views section.

## Best Practices

### Do

- Use semantic color tokens (`bg-[color:var(--background)]`, `text-[color:var(--foreground)]`)
- Accept `className` prop on components
- Use `cn()` for conditional classes
- Keep desktop UX conventions (cursor, selection, scroll)
- Follow existing patterns in codebase
- Use atoms from `@/components/atoms` for brand-aware building blocks
- Use the shadcn override pattern (mechanical rewrite) for every new shadcn component

### Don't

- Use raw color values (`bg-white`, `text-gray-900`)
- Hardcode light/dark specific values
- Add `cursor-pointer` everywhere (only for actual clickable elements)
- Use viewport-based responsive design (this is a fixed-size desktop app)
- Add a new navigation rail — extend the Sidebar's sections instead
