# Collier UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply a coherent Dark Dev-Power / Linear-Raycast design system across the entire Collier UI, fix the brand identity (icon + title), and collapse the 3-panel layout into a single consolidated sidebar.

**Architecture:** Mechanical override pass over the 39 shadcn primitives in `src/components/ui/`, a 5-atom new primitive set in `src/components/atoms/`, a rewrite of the design-tokens module + theme variables CSS, a layout restructure (3-panel → 2-panel with consolidated sidebar), and a one-shot icon regeneration. Zero new dependencies, zero new Tauri commands, zero new features.

**Tech Stack:** Tauri v2.11, React 19, TypeScript 5, Tailwind v4 (CSS-based config), shadcn/ui v4 (new-york), Lucide icons, Vitest v4, @tauri-apps/cli for icon rasterization.

**Spec:** `docs/superpowers/specs/2026-06-18-collier-ui-redesign-design.md`

---

## File Map (the change surface)

| Bucket                     | Files                                                                                                                             | What changes                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Tokens**                 | `src/lib/design-tokens.ts`, `src/theme-variables.css`, `src/App.css`                                                              | Rewrite tokens (dark default, radius scale, vibrancy via @supports). Add legacy `colors` alias. |
| **Atoms (new)**            | `src/components/atoms/Monogram.tsx` + 4 more, with tests                                                                          | 5 new primitives.                                                                               |
| **shadcn overrides**       | 39 files in `src/components/ui/`                                                                                                  | Radius / border / shadow / backdrop-blur refresh. No structural rewrites.                       |
| **Title bar**              | `src/components/titlebar/TitleBarContent.tsx`, `TitleBar.tsx`                                                                     | Add Monogram + breadcrumb + ⌘K hint.                                                            |
| **Sidebar (consolidated)** | `src/components/layout/Sidebar.tsx` (new), `MainWindow.tsx`, `MainWindowContent.tsx`                                              | New 2-panel layout. ViewTabs deleted. FilterSidebar + LabelListView folded in.                  |
| **Views (10)**             | `src/components/beads/issues/IssueListView.tsx` + 9 more                                                                          | Row visuals refresh + EmptyState adoption.                                                      |
| **Overlays**               | `src/components/beads/IssueDetailDrawer.tsx`, `command-palette/CommandPalette.tsx`, `preferences/PreferencesDialog.tsx` + 4 panes | Backdrop-blur, animations, icon-strip nav.                                                      |
| **i18n**                   | `locales/{en,de,fr,ar}.json`                                                                                                      | Add 7 new strings.                                                                              |
| **Icons**                  | `src-tauri/icons/icon.svg` (new source), regenerate all sizes, `public/favicon.svg`, `public/Icon.svg` (delete)                   | Gradient "C" mark.                                                                              |
| **Docs**                   | `docs/developer/ui-patterns.md`, `docs/developer/README.md`, `docs/developer/architecture-guide.md`                               | Document the new design system.                                                                 |

**Phases** (each ends with `bun run check:all` passing):

- **Phase 1** — Foundation (tokens, theme, i18n, gitignore)
- **Phase 2** — New atoms (5 primitives + tests)
- **Phase 3** — shadcn primitive overrides (39 files, mechanical)
- **Phase 4** — App shell (title bar, consolidated sidebar, 2-panel layout)
- **Phase 5** — Views refresh (10 views, row visuals + empty states)
- **Phase 6** — Overlays (drawer, command palette, preferences)
- **Phase 7** — Icons (regenerate all sizes)
- **Phase 8** — Validation (check:all, visual verification)

---

## Phase 1 — Foundation

### Task 1.1: Update `.gitignore` (already done)

**Files:**

- Modify: `.gitignore` (line ~19)

- [ ] **Step 1: Verify .gitignore contains `.superpowers/`**

Run: `grep -F '.superpowers/' .gitignore`
Expected: `.superpowers/` line present.

If not present, add it under the `# OMO session state` block (already done in this session).

---

### Task 1.2: Rewrite `src/lib/design-tokens.ts`

**Files:**

- Modify: `src/lib/design-tokens.ts` (entire file, 84 lines → ~250 lines)
- Test: `src/lib/design-tokens.test.ts` (already exists — update if assertions break)

- [ ] **Step 1: Add failing test for new `palette.bg` export**

In `src/lib/design-tokens.test.ts` add:

```ts
import { palette, radius, motion, vibrancy } from './design-tokens'

describe('design tokens — palette', () => {
  it('exposes the Linear-purple accent', () => {
    expect(palette.accent).toBe('#5e6ad2')
  })
  it('exposes danger = #ef4444 (P0 / destructive only)', () => {
    expect(palette.danger).toBe('#ef4444')
  })
  it('exposes status colors', () => {
    expect(palette.statusInProgress).toBe('#5e6ad2')
    expect(palette.statusBlocked).toBe('#fb923c')
  })
})

describe('design tokens — radius', () => {
  it('uses non-zero radii (macOS style)', () => {
    expect(radius.sm).toBe(6)
    expect(radius.md).toBe(8)
    expect(radius.lg).toBe(10)
    expect(radius.xl).toBe(12)
  })
})

describe('design tokens — motion', () => {
  it('defines standard easing', () => {
    expect(motion.easing.standard).toBe('cubic-bezier(0.2, 0, 0, 1)')
  })
})

describe('design tokens — vibrancy', () => {
  it('exposes sidebar vibrancy color', () => {
    expect(vibrancy.sidebar).toMatch(/rgba\(20, 20, 20, 0\.72\)/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/design-tokens.test.ts`
Expected: FAIL — `palette is not exported`.

- [ ] **Step 3: Rewrite `src/lib/design-tokens.ts`**

```ts
/**
 * Design tokens — Dark Dev-Power / Linear-Raycast.
 * The Bauhaus mono-only palette is preserved as a legacy alias below;
 * the new `palette` object is the canonical source.
 */

export const palette = {
  // Surface scale (dark is the new default)
  bg: '#0a0a0a',
  surface: '#141414',
  surfaceAlt: '#1a1a1a',
  surfaceHigh: '#262626',
  border: 'rgba(255, 255, 255, 0.08)',
  borderStrong: 'rgba(255, 255, 255, 0.14)',

  // Text scale
  textPrimary: '#fafafa',
  textSecondary: '#d4d4d4',
  textMuted: '#a3a3a3',
  textDisabled: '#737373',

  // Brand
  accent: '#5e6ad2',
  accentHover: '#7080e0',
  accentActive: '#4d59c0',
  accentText: '#ffffff',
  accentMuted: 'rgba(94, 106, 210, 0.18)',

  // Semantic
  success: '#22c55e',
  warning: '#fb923c',
  danger: '#ef4444',
  info: '#5e6ad2',

  // Status (issue pipeline)
  statusOpen: '#a3a3a3',
  statusInProgress: '#5e6ad2',
  statusBlocked: '#fb923c',
  statusClosed: '#525252',
  statusDeferred: '#737373',

  // Priority
  priorityP0: '#ef4444',
  priorityP1: '#fafafa',
  priorityP2: '#d4d4d4',
  priorityP3: '#a3a3a3',
  priorityP4: '#737373',
} as const

// Legacy alias — keeps `colors.monoN` and `colors.accent` working until
// every consumer is ported. Remove in a follow-up cleanup.
export const colors = {
  mono0: palette.textPrimary,
  mono1: '#171717',
  mono2: palette.surfaceHigh,
  mono3: '#404040',
  mono4: '#525252',
  mono5: palette.textMuted,
  mono6: palette.statusOpen,
  mono7: '#d4d4d4',
  mono8: palette.surface,
  mono9: palette.bg,
  accent: palette.danger,
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

export const grid = {
  columns: 8,
  base: 4,
  gutter: 16,
} as const

export const type = {
  fontFamily: {
    sans: '-apple-system, "SF Pro Display", "Inter", system-ui, sans-serif',
    mono: '"SF Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  fontWeight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
  fontSize: {
    xs: 11,
    sm: 12,
    base: 13,
    md: 14,
    lg: 16,
    xl: 20,
    '2xl': 28,
    '3xl': 40,
  },
  lineHeight: { tight: 1.2, normal: 1.5, loose: 1.7 },
  letterSpacing: {
    tight: '-0.01em',
    normal: '0',
    wide: '0.04em',
    caps: '0.08em',
  },
} as const

export const radius = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
  '2xl': 16,
  full: 9999,
} as const

export const shadow = {
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

export const vibrancy = {
  sidebar: 'rgba(20, 20, 20, 0.72)',
  popover: 'rgba(26, 26, 26, 0.82)',
  modal: 'rgba(20, 20, 20, 0.88)',
  titleBar: 'rgba(20, 20, 20, 0.6)',
  drawer: 'rgba(20, 20, 20, 0.92)',
} as const
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/design-tokens.test.ts`
Expected: PASS (10/10 cases).

- [ ] **Step 5: Run full check**

Run: `bun run check:all`
Expected: PASS. (Some component tests will still pass because `colors.mono*` is kept as an alias.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/design-tokens.ts src/lib/design-tokens.test.ts
git commit -m "feat(tokens): add Dark Dev-Power palette + keep Bauhaus alias"
```

---

### Task 1.3: Rewrite `src/theme-variables.css`

**Files:**

- Modify: `src/theme-variables.css` (entire file)

- [ ] **Step 1: Backup the current file**

Run: `cp src/theme-variables.css src/theme-variables.css.bak`

- [ ] **Step 2: Replace the file with the new content**

```css
/*
 * Theme Variables — Dark Dev-Power / Linear-Raycast.
 * Dark is the default. Light is an opt-in via the `.light` class on
 * <html> (driven by `useTheme`). Vibrancy is provided via @supports
 * so Windows / Linux get solid backgrounds automatically.
 */

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: -apple-system, 'SF Pro Display', 'Inter', system-ui, sans-serif;
  --font-mono: 'SF Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  --color-sidebar-ring: var(--sidebar-ring);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar: var(--sidebar);
  --color-ring: var(--ring);
  --color-input: var(--input);
  --color-border: var(--border);
  --color-destructive: var(--destructive);
  --color-accent-foreground: var(--accent-foreground);
  --color-accent: var(--accent);
  --color-muted-foreground: var(--muted-foreground);
  --color-muted: var(--muted);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-secondary: var(--secondary);
  --color-primary-foreground: var(--primary-foreground);
  --color-primary: var(--primary);
  --color-popover-foreground: var(--popover-foreground);
  --color-popover: var(--popover);
  --color-card-foreground: var(--card-foreground);
  --color-card: var(--card);
  --radius-sm: calc(var(--radius) - 2px);
  --radius-md: var(--radius);
  --radius-lg: calc(var(--radius) + 2px);
  --radius-xl: calc(var(--radius) + 4px);
}

:root,
.dark {
  --background: #0a0a0a;
  --foreground: #fafafa;
  --card: #141414;
  --card-foreground: #fafafa;
  --popover: #1a1a1a;
  --popover-foreground: #fafafa;
  --primary: #5e6ad2;
  --primary-foreground: #ffffff;
  --secondary: #1a1a1a;
  --secondary-foreground: #fafafa;
  --muted: #1a1a1a;
  --muted-foreground: #a3a3a3;
  --accent: #5e6ad2;
  --accent-foreground: #ffffff;
  --destructive: #ef4444;
  --destructive-foreground: #ffffff;
  --border: rgba(255, 255, 255, 0.08);
  --input: rgba(255, 255, 255, 0.08);
  --ring: #5e6ad2;
  --radius: 0.5rem;
  --sidebar: #141414;
  --sidebar-foreground: #fafafa;
  --sidebar-primary: #5e6ad2;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: rgba(255, 255, 255, 0.08);
  --sidebar-accent-foreground: #fafafa;
  --sidebar-border: rgba(255, 255, 255, 0.08);
  --sidebar-ring: #5e6ad2;
}

.light {
  --background: #fafafa;
  --foreground: #0a0a0a;
  --card: #ffffff;
  --card-foreground: #0a0a0a;
  --popover: #ffffff;
  --popover-foreground: #0a0a0a;
  --primary: #5e6ad2;
  --primary-foreground: #ffffff;
  --secondary: #f5f5f7;
  --secondary-foreground: #0a0a0a;
  --muted: #f5f5f7;
  --muted-foreground: #525252;
  --accent: #5e6ad2;
  --accent-foreground: #ffffff;
  --destructive: #ef4444;
  --destructive-foreground: #ffffff;
  --border: rgba(0, 0, 0, 0.08);
  --input: rgba(0, 0, 0, 0.08);
  --ring: #5e6ad2;
  --sidebar: #ffffff;
  --sidebar-foreground: #0a0a0a;
  --sidebar-accent: rgba(0, 0, 0, 0.04);
  --sidebar-accent-foreground: #0a0a0a;
  --sidebar-border: rgba(0, 0, 0, 0.08);
}

@supports (backdrop-filter: blur(20px)) {
  :root,
  .dark {
    --sidebar: rgba(20, 20, 20, 0.72);
    --popover: rgba(26, 26, 26, 0.82);
  }
  .light {
    --sidebar: rgba(245, 245, 247, 0.78);
    --popover: rgba(255, 255, 255, 0.85);
  }
}

@media (prefers-reduced-motion: reduce) {
  :root {
    --sidebar-transition-duration: 0ms;
  }
}
```

- [ ] **Step 3: Remove the backup**

Run: `rm src/theme-variables.css.bak`

- [ ] **Step 4: Run check:all**

Run: `bun run check:all`
Expected: PASS. The 39 shadcn primitives will pick up the new tokens automatically.

- [ ] **Step 5: Commit**

```bash
git add src/theme-variables.css
git commit -m "feat(theme): dark-default Linear-Raycast tokens + vibrancy via @supports"
```

---

### Task 1.4: Add i18n strings

**Files:**

- Modify: `locales/en.json`, `locales/de.json`, `locales/fr.json`, `locales/ar.json`

- [ ] **Step 1: Add strings to `locales/en.json`**

Under the existing `titlebar` key, add/replace:

```json
"titlebar": {
  "default": "Collier",
  "workspace": "Workspace",
  "openCommandPalette": "Open command palette",
  "settings": "Settings",
  "hideLeftSidebar": "Hide sidebar",
  "showLeftSidebar": "Show sidebar"
}
```

Under the top level, add:

```json
"sidebar": {
  "sections": {
    "views": "Views",
    "filters": "Filters",
    "labels": "Labels"
  },
  "newIssue": "New issue",
  "sort": "Sort",
  "group": "Group"
}
```

- [ ] **Step 2: Mirror to `de.json`**

```json
"titlebar": {
  "default": "Collier",
  "workspace": "Arbeitsbereich",
  "openCommandPalette": "Befehlspalette öffnen",
  "settings": "Einstellungen",
  "hideLeftSidebar": "Seitenleiste ausblenden",
  "showLeftSidebar": "Seitenleiste anzeigen"
},
"sidebar": {
  "sections": { "views": "Ansichten", "filters": "Filter", "labels": "Labels" },
  "newIssue": "Neues Issue",
  "sort": "Sortieren",
  "group": "Gruppieren"
}
```

- [ ] **Step 3: Mirror to `fr.json`**

```json
"titlebar": {
  "default": "Collier",
  "workspace": "Espace de travail",
  "openCommandPalette": "Ouvrir la palette de commandes",
  "settings": "Paramètres",
  "hideLeftSidebar": "Masquer le panneau",
  "showLeftSidebar": "Afficher le panneau"
},
"sidebar": {
  "sections": { "views": "Vues", "filters": "Filtres", "labels": "Étiquettes" },
  "newIssue": "Nouveau ticket",
  "sort": "Trier",
  "group": "Regrouper"
}
```

- [ ] **Step 4: Mirror to `ar.json` (RTL)**

```json
"titlebar": {
  "default": "Collier",
  "workspace": "مساحة العمل",
  "openCommandPalette": "افتح لوحة الأوامر",
  "settings": "الإعدادات",
  "hideLeftSidebar": "إخفاء الشريط الجانبي",
  "showLeftSidebar": "إظهار الشريط الجانبي"
},
"sidebar": {
  "sections": { "views": "العروض", "filters": "الفلاتر", "labels": "التسميات" },
  "newIssue": "تذكرة جديدة",
  "sort": "ترتيب",
  "group": "تجميع"
}
```

- [ ] **Step 5: Run check:all**

Run: `bun run check:all`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add locales/
git commit -m "feat(i18n): add titlebar.default 'Collier' + sidebar section strings"
```

---

## Phase 2 — New atoms (5 primitives)

### Task 2.1: Monogram atom

**Files:**

- Create: `src/components/atoms/Monogram.tsx`
- Create: `src/components/atoms/index.ts`
- Create: `src/components/atoms/Monogram.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/components/atoms/Monogram.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Monogram } from './Monogram'

describe('Monogram', () => {
  it('renders the "C" letter', () => {
    render(<Monogram size={22} data-testid="mg" />)
    expect(screen.getByTestId('mg').textContent).toBe('C')
  })

  it('applies the gradient background', () => {
    render(<Monogram size={22} data-testid="mg" />)
    const el = screen.getByTestId('mg')
    expect(el.style.background).toContain('linear-gradient')
    expect(el.style.background).toContain('#5e6ad2')
    expect(el.style.background).toContain('#7c3aed')
  })

  it('uses the requested size', () => {
    render(<Monogram size={32} data-testid="mg" />)
    const el = screen.getByTestId('mg')
    expect(el.style.width).toBe('32px')
    expect(el.style.height).toBe('32px')
  })

  it('exposes aria-label when provided', () => {
    render(<Monogram size={22} ariaLabel="Collier logo" data-testid="mg" />)
    expect(screen.getByTestId('mg')).toHaveAttribute(
      'aria-label',
      'Collier logo'
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/components/atoms/Monogram.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

`src/components/atoms/Monogram.tsx`:

```tsx
import type { CSSProperties } from 'react'

export interface MonogramProps {
  /** Square edge length in px. Default 22. */
  size?: number
  /** Optional accessible label. Default: "Collier". */
  ariaLabel?: string
  /** Forwarded for QA selectors. */
  'data-testid'?: string
}

/**
 * Monogram — the 22×22 gradient "C" brand mark.
 * Used in the title bar, as the command-palette header, and as the
 * source SVG for icon rasterization. The gradient is the Linear-purple
 * brand pair: #5e6ad2 → #7c3aed.
 */
export function Monogram({
  size = 22,
  ariaLabel = 'Collier',
  ...rest
}: MonogramProps) {
  const style: CSSProperties = {
    width: size,
    height: size,
    background: 'linear-gradient(135deg, #5e6ad2 0%, #7c3aed 100%)',
    borderRadius: Math.round(size * 0.23),
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily:
      '-apple-system, "SF Pro Display", "Inter", system-ui, sans-serif',
    fontWeight: 700,
    fontSize: Math.round(size * 0.6),
    lineHeight: 1,
    color: '#ffffff',
    userSelect: 'none',
    flexShrink: 0,
  }
  return (
    <span style={style} aria-label={ariaLabel} role="img" {...rest}>
      C
    </span>
  )
}

export default Monogram
```

`src/components/atoms/index.ts`:

```ts
export { Monogram } from './Monogram'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/components/atoms/Monogram.test.tsx`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add src/components/atoms/
git commit -m "feat(atoms): add Monogram brand mark"
```

---

### Task 2.2: SectionLabel atom

**Files:**

- Create: `src/components/atoms/SectionLabel.tsx`
- Create: `src/components/atoms/SectionLabel.test.tsx`
- Modify: `src/components/atoms/index.ts`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { SectionLabel } from './SectionLabel'

describe('SectionLabel', () => {
  it('uppercases the text', () => {
    render(<SectionLabel>Filters</SectionLabel>)
    expect(screen.getByText('FILTERS')).toBeInTheDocument()
  })

  it('uses the caps letter-spacing token (0.08em)', () => {
    render(<SectionLabel data-testid="sl">Views</SectionLabel>)
    const el = screen.getByTestId('sl')
    expect(el.style.letterSpacing).toBe('0.08em')
  })

  it('forwards the data-testid', () => {
    render(<SectionLabel data-testid="x">Labels</SectionLabel>)
    expect(screen.getByTestId('x')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/components/atoms/SectionLabel.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
import type { CSSProperties, ReactNode } from 'react'

export interface SectionLabelProps {
  children: ReactNode
  className?: string
  'data-testid'?: string
}

const style: CSSProperties = {
  fontFamily: '-apple-system, "SF Pro Display", "Inter", system-ui, sans-serif',
  fontSize: 10,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#a3a3a3',
  padding: '14px 8px 4px',
  display: 'block',
  userSelect: 'none',
}

/**
 * SectionLabel — the uppercase 10px label used for "Views", "Filters",
 * "Labels" in the consolidated sidebar. Linear-style section header.
 */
export function SectionLabel({
  children,
  className,
  ...rest
}: SectionLabelProps) {
  return (
    <span style={style} className={className} {...rest}>
      {children}
    </span>
  )
}

export default SectionLabel
```

Append to `src/components/atoms/index.ts`:

```ts
export { SectionLabel } from './SectionLabel'
```

- [ ] **Step 4: Run test, commit**

Run: `bun test src/components/atoms/SectionLabel.test.tsx` — PASS (3/3).

```bash
git add src/components/atoms/
git commit -m "feat(atoms): add SectionLabel for sidebar section headers"
```

---

### Task 2.3: PriorityBadge atom

**Files:**

- Create: `src/components/atoms/PriorityBadge.tsx`
- Create: `src/components/atoms/PriorityBadge.test.tsx`
- Modify: `src/components/atoms/index.ts`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PriorityBadge } from './PriorityBadge'

describe('PriorityBadge', () => {
  it('P0 is red and bold', () => {
    render(<PriorityBadge priority="P0" data-testid="pb" />)
    const el = screen.getByTestId('pb')
    expect(el.style.color).toBe('rgb(239, 68, 68)')
    expect(el.style.fontWeight).toBe('600')
  })

  it('P2 is muted', () => {
    render(<PriorityBadge priority="P2" data-testid="pb" />)
    const el = screen.getByTestId('pb')
    expect(el.style.color).toBe('rgb(212, 212, 212)')
  })

  it('uses the mono font family', () => {
    render(<PriorityBadge priority="P1" data-testid="pb" />)
    const el = screen.getByTestId('pb')
    expect(el.style.fontFamily).toContain('SF Mono')
  })

  it('has aria-label', () => {
    render(<PriorityBadge priority="P0" />)
    expect(screen.getByLabelText('P0')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run, fail, implement**

Run: `bun test src/components/atoms/PriorityBadge.test.tsx` — FAIL.

`src/components/atoms/PriorityBadge.tsx`:

```tsx
import type { CSSProperties } from 'react'
import type { IssuePriority } from '@/lib/bindings'
import { palette } from '@/lib/design-tokens'

const colorByPriority: Record<IssuePriority, string> = {
  P0: palette.danger,
  P1: palette.textPrimary,
  P2: palette.textSecondary,
  P3: palette.textMuted,
  P4: palette.textDisabled,
}

export interface PriorityBadgeProps {
  priority: IssuePriority
  className?: string
  'data-testid'?: string
}

const style: CSSProperties = {
  fontFamily: '"SF Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.04em',
  userSelect: 'none',
}

/**
 * PriorityBadge — the "P0".."P4" token in the issue list. P0 is the
 * only priority rendered in the danger colour. Mono font keeps it
 * distinct from body text.
 */
export function PriorityBadge({
  priority,
  className,
  ...rest
}: PriorityBadgeProps) {
  return (
    <span
      style={{ ...style, color: colorByPriority[priority] }}
      aria-label={priority}
      className={className}
      {...rest}
    >
      {priority}
    </span>
  )
}

export default PriorityBadge
```

Append to `src/components/atoms/index.ts`:

```ts
export { PriorityBadge } from './PriorityBadge'
```

- [ ] **Step 3: Run, commit**

Run: `bun test src/components/atoms/PriorityBadge.test.tsx` — PASS (4/4).

```bash
git add src/components/atoms/
git commit -m "feat(atoms): add PriorityBadge (mono, danger for P0)"
```

---

### Task 2.4: StatusDot atom

**Files:**

- Create: `src/components/atoms/StatusDot.tsx`
- Create: `src/components/atoms/StatusDot.test.tsx`
- Modify: `src/components/atoms/index.ts`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { StatusDot } from './StatusDot'

describe('StatusDot', () => {
  it('uses the in-progress accent for in_progress', () => {
    render(<StatusDot status="in_progress" data-testid="sd" />)
    const el = screen.getByTestId('sd')
    expect(el.style.backgroundColor).toBe('rgb(94, 106, 210)')
  })

  it('uses the warning color for blocked', () => {
    render(<StatusDot status="blocked" data-testid="sd" />)
    expect(screen.getByTestId('sd').style.backgroundColor).toBe(
      'rgb(251, 146, 60)'
    )
  })

  it('uses the muted mono for closed', () => {
    render(<StatusDot status="closed" data-testid="sd" />)
    expect(screen.getByTestId('sd').style.backgroundColor).toBe(
      'rgb(82, 82, 82)'
    )
  })

  it('exposes aria-label', () => {
    render(<StatusDot status="open" />)
    expect(screen.getByLabelText('open')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run, fail, implement**

Run: `bun test src/components/atoms/StatusDot.test.tsx` — FAIL.

`src/components/atoms/StatusDot.tsx`:

```tsx
import type { CSSProperties } from 'react'
import type { IssueStatus } from '@/lib/bindings'
import { palette } from '@/lib/design-tokens'

const colorByStatus: Record<IssueStatus, string> = {
  open: palette.statusOpen,
  in_progress: palette.statusInProgress,
  blocked: palette.statusBlocked,
  closed: palette.statusClosed,
  deferred: palette.statusDeferred,
}

export interface StatusDotProps {
  status: IssueStatus
  size?: number
  className?: string
  'data-testid'?: string
}

/**
 * StatusDot — 8px circle in the status colour. Used in issue rows and
 * the sidebar's recent-status chip. Decorative when paired with text
 * (set aria-hidden) or self-describing when alone (default aria-label).
 */
export function StatusDot({
  status,
  size = 8,
  className,
  ...rest
}: StatusDotProps) {
  const style: CSSProperties = {
    width: size,
    height: size,
    borderRadius: 9999,
    backgroundColor: colorByStatus[status],
    display: 'inline-block',
    flexShrink: 0,
  }
  return (
    <span
      style={style}
      aria-label={status}
      role="img"
      className={className}
      {...rest}
    />
  )
}

export default StatusDot
```

Append to `src/components/atoms/index.ts`:

```ts
export { StatusDot } from './StatusDot'
```

- [ ] **Step 3: Run, commit**

Run: `bun test src/components/atoms/StatusDot.test.tsx` — PASS (4/4).

```bash
git add src/components/atoms/
git commit -m "feat(atoms): add StatusDot (8px, semantic colors)"
```

---

### Task 2.5: EmptyState atom

**Files:**

- Create: `src/components/atoms/EmptyState.tsx`
- Create: `src/components/atoms/EmptyState.test.tsx`
- Modify: `src/components/atoms/index.ts`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Inbox } from 'lucide-react'
import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('renders title, body, and CTA', () => {
    render(
      <EmptyState
        icon={Inbox}
        title="Nothing here yet"
        body="Issues you create will show up here."
        cta={<button>+ New issue</button>}
      />
    )
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument()
    expect(
      screen.getByText('Issues you create will show up here.')
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: '+ New issue' })
    ).toBeInTheDocument()
  })

  it('uses the accent-muted icon background', () => {
    render(<EmptyState icon={Inbox} title="t" body="b" data-testid="es" />)
    const icon = screen
      .getByTestId('es')
      .querySelector('div > div') as HTMLElement
    expect(icon.style.background).toContain('rgba(94, 106, 210, 0.18)')
  })
})
```

- [ ] **Step 2: Run, fail, implement**

Run: `bun test src/components/atoms/EmptyState.test.tsx` — FAIL.

`src/components/atoms/EmptyState.tsx`:

```tsx
import type { ComponentType, CSSProperties, ReactNode } from 'react'
import type { LucideProps } from 'lucide-react'
import { palette } from '@/lib/design-tokens'

export interface EmptyStateProps {
  icon: ComponentType<LucideProps>
  title: string
  body: string
  cta?: ReactNode
  className?: string
  'data-testid'?: string
}

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  gap: 12,
  padding: '48px 24px',
  color: palette.textSecondary,
  fontFamily: '-apple-system, "SF Pro Display", "Inter", system-ui, sans-serif',
}

const iconWrapStyle: CSSProperties = {
  width: 64,
  height: 64,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: palette.accentMuted,
  borderRadius: 12,
  color: palette.accent,
}

const titleStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 600,
  color: palette.textPrimary,
  margin: 0,
  lineHeight: 1.2,
}

const bodyStyle: CSSProperties = {
  fontSize: 13,
  color: palette.textMuted,
  margin: 0,
  lineHeight: 1.5,
  maxWidth: 320,
}

/**
 * EmptyState — centered icon + heading + body + optional CTA. Replaces
 * the five inline empty states across the views.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  cta,
  className,
  ...rest
}: EmptyStateProps) {
  return (
    <div style={containerStyle} className={className} {...rest}>
      <div style={iconWrapStyle}>
        <Icon size={24} strokeWidth={1.5} aria-hidden="true" />
      </div>
      <h3 style={titleStyle}>{title}</h3>
      <p style={bodyStyle}>{body}</p>
      {cta ? <div>{cta}</div> : null}
    </div>
  )
}

export default EmptyState
```

Append to `src/components/atoms/index.ts`:

```ts
export { EmptyState } from './EmptyState'
```

- [ ] **Step 3: Run, commit**

Run: `bun test src/components/atoms/EmptyState.test.tsx` — PASS (2/2).

```bash
git add src/components/atoms/
git commit -m "feat(atoms): add EmptyState for view empty paths"
```

- [ ] **Step 6: Run full check:all**

Run: `bun run check:all` — PASS. End of Phase 2.

---

## Phase 3 — shadcn primitive overrides (mechanical)

This phase is a single task: walk through the 39 primitives in `src/components/ui/`, swap `rounded-md/lg/xl` → `rounded-[var(--radius)]`, `border-border` → `border-[color:var(--border)]`, add `backdrop-blur-xl` to overlay primitives (Dialog, Popover, Sheet, Command, DropdownMenu, Tooltip), refresh focus rings. No structural rewrites.

### Task 3.1: Override button + form primitives

**Files:**

- Modify: `src/components/ui/button.tsx`
- Modify: `src/components/ui/input.tsx`
- Modify: `src/components/ui/textarea.tsx`
- Modify: `src/components/ui/checkbox.tsx`
- Modify: `src/components/ui/switch.tsx`
- Modify: `src/components/ui/radio-group.tsx`
- Modify: `src/components/ui/toggle.tsx`
- Modify: `src/components/ui/toggle-group.tsx`
- Modify: `src/components/ui/select.tsx`
- Modify: `src/components/ui/native-select.tsx`
- Modify: `src/components/ui/field.tsx`
- Modify: `src/components/ui/input-group.tsx`
- Modify: `src/components/ui/tag-input.tsx`
- Modify: `src/components/ui/label.tsx`
- Modify: `src/components/ui/calendar.tsx`
- Modify: `src/components/ui/date-picker.tsx`

- [ ] **Step 1: Update `button.tsx` — replace the CVA base + add `subtle` variant**

In `src/components/ui/button.tsx`, replace the `buttonVariants` CVA call with:

```ts
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--background)] aria-invalid:ring-[color:var(--destructive)] aria-invalid:border-[color:var(--destructive)]",
  {
    variants: {
      variant: {
        default:
          'bg-[color:var(--primary)] text-[color:var(--primary-foreground)] hover:bg-[color:var(--accent-hover)] active:bg-[color:var(--accent-active)]',
        destructive:
          'bg-[color:var(--destructive)] text-[color:var(--destructive-foreground)] hover:opacity-90',
        outline:
          'border bg-[color:var(--background)] shadow-xs hover:bg-[color:var(--accent)]/10 hover:text-[color:var(--accent-foreground)] border-[color:var(--border)]',
        secondary:
          'bg-[color:var(--secondary)] text-[color:var(--secondary-foreground)] hover:bg-[color:var(--secondary)]/80',
        subtle:
          'bg-transparent text-[color:var(--foreground)] hover:bg-[color:var(--secondary)]',
        ghost:
          'bg-transparent text-[color:var(--foreground)] hover:bg-[color:var(--accent)]/10',
        link: 'text-[color:var(--primary)] underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-10 px-6 has-[>svg]:px-4',
        icon: 'size-9',
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
)
```

(The `rounded-md` is dropped because the new `--radius` is 0.5rem which IS the default rounded; explicit `rounded-[var(--radius)]` works too. The accent-hover/active tokens are added to `src/theme-variables.css` in a follow-up commit if you want full token coverage — for now, the hover uses Tailwind opacity which the new tokens respect.)

- [ ] **Step 2: Run the button snapshot tests**

Run: `bun test src/components/ui/button` (there are no dedicated button tests, but the `app` smoke test uses Button — run `bun test` to confirm nothing breaks)

Expected: PASS. If a snapshot test fails, the diff is the new border / focus class — update the snapshot.

- [ ] **Step 3: Update the remaining 15 primitives with the same pattern**

For each file, apply these rules in order:

1. `rounded-md` → `rounded-[var(--radius)]`
2. `rounded-lg` → `rounded-[var(--radius)]`
3. `rounded-xl` → `rounded-[var(--radius)]`
4. `border-border` → `border-[color:var(--border)]`
5. `bg-background` → `bg-[color:var(--background)]`
6. `bg-card` → `bg-[color:var(--card)]`
7. `text-muted-foreground` → `text-[color:var(--muted-foreground)]`
8. `focus-visible:ring-ring/50` → `focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--background)]`

Files affected: every file in `src/components/ui/` that has any of those class strings. The list above is the minimum; use `grep` to find any others.

- [ ] **Step 4: Run check:all**

Run: `bun run check:all`
Expected: PASS. (Some snapshot tests may need updating — do that as part of this step.)

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/
git commit -m "refactor(ui): override 15 form + button primitives to use new tokens"
```

---

### Task 3.2: Override overlay primitives (backdrop-blur + radius)

**Files:**

- Modify: `src/components/ui/dialog.tsx`
- Modify: `src/components/ui/popover.tsx`
- Modify: `src/components/ui/sheet.tsx`
- Modify: `src/components/ui/command.tsx`
- Modify: `src/components/ui/dropdown-menu.tsx`
- Modify: `src/components/ui/tooltip.tsx`
- Modify: `src/components/ui/alert.tsx`
- Modify: `src/components/ui/alert-dialog.tsx`
- Modify: `src/components/ui/sonner.tsx`
- Modify: `src/components/ui/scroll-area.tsx`

- [ ] **Step 1: Update Dialog content to use `bg-[var(--popover)]` + `backdrop-blur-xl`**

In `src/components/ui/dialog.tsx`, locate the `DialogContent` CVA, replace its base + add backdrop-blur:

```ts
const dialogContentVariants = cva(
  'fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 bg-[color:var(--popover)] backdrop-blur-xl text-[color:var(--popover-foreground)] p-6 shadow-lg duration-200 sm:max-w-lg',
  {
    variants: {
      variant: {
        default: '',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)
```

- [ ] **Step 2: Apply the same pattern to Popover, Sheet, Command, DropdownMenu, Tooltip, AlertDialog, Sonner**

For each file, the recipe is:

- Locate the CVA (or className const) for the content/overlay component.
- Replace `bg-popover` / `bg-background` / `bg-card` with `bg-[color:var(--popover)]`.
- Add `backdrop-blur-xl` (skip on `tooltip` — toasts don't blur their trigger).
- Add `shadow-lg` (new shadow token from `src/lib/design-tokens.ts`) where applicable.
- `rounded-lg` / `rounded-xl` → `rounded-[var(--radius)]`.

For `sonner.tsx`, the `<Toaster>` in `MainWindow.tsx` passes a `toastOptions` object — that needs updating too:

```ts
// in MainWindow.tsx
<Toaster
  position="bottom-right"
  theme={theme === 'dark' ? 'dark' : theme === 'light' ? 'light' : 'system'}
  className="toaster group"
  toastOptions={{
    classNames: {
      toast:
        'group toast group-[.toaster]:bg-[color:var(--popover)] group-[.toaster]:backdrop-blur-xl group-[.toaster]:text-[color:var(--popover-foreground)] group-[.toaster]:border group-[.toaster]:border-[color:var(--border)] group-[.toaster]:shadow-lg group-[.toaster]:rounded-[var(--radius)]',
      description: 'group-[.toast]:text-[color:var(--muted-foreground)]',
      actionButton:
        'group-[.toast]:bg-[color:var(--primary)] group-[.toast]:text-[color:var(--primary-foreground)]',
      cancelButton:
        'group-[.toast]:bg-[color:var(--muted)] group-[.toast]:text-[color:var(--muted-foreground)]',
    },
  }}
/>
```

- [ ] **Step 3: Run check:all**

Run: `bun run check:all`
Expected: PASS. Some snapshot tests may need updates.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/ src/components/layout/MainWindow.tsx
git commit -m "refactor(ui): add backdrop-blur + new radius to overlay primitives"
```

---

### Task 3.3: Override display primitives + sidebar + resizable

**Files:**

- Modify: `src/components/ui/card.tsx`
- Modify: `src/components/ui/badge.tsx`
- Modify: `src/components/ui/kbd.tsx`
- Modify: `src/components/ui/separator.tsx`
- Modify: `src/components/ui/skeleton.tsx`
- Modify: `src/components/ui/spinner.tsx`
- Modify: `src/components/ui/empty.tsx`
- Modify: `src/components/ui/item.tsx`
- Modify: `src/components/ui/breadcrumb.tsx`
- Modify: `src/components/ui/sidebar.tsx`
- Modify: `src/components/ui/resizable.tsx`
- Modify: `src/components/ui/aspect-ratio.tsx` (if present)
- Modify: any other primitive found via `ls src/components/ui/`

- [ ] **Step 1: Apply the same mechanical override to the remaining primitives**

For each file, apply:

- `rounded-md` / `rounded-lg` / `rounded-xl` → `rounded-[var(--radius)]`
- `border-border` → `border-[color:var(--border)]`
- `bg-background` → `bg-[color:var(--background)]`
- `text-muted-foreground` → `text-[color:var(--muted-foreground)]`
- For the **shadcn `sidebar.tsx`**: also add `backdrop-blur-xl` to the `Sidebar` root (`data-slot="sidebar-container"`) and switch the inner to `bg-[color:var(--sidebar)]`. The 1px `border-r` on the left side becomes `border-r border-[color:var(--sidebar-border)]`.

- [ ] **Step 2: Update `resizable.tsx` handle visual**

In `src/components/ui/resizable.tsx`, locate the `ResizableHandle` className and replace:

```ts
// before
'relative flex w-px items-center justify-center bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1 [&[data-panel-group-direction=vertical]>div]:rotate-90'
// after
'relative flex w-px items-center justify-center bg-transparent hover:bg-[color:var(--accent)]/10 after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--ring)] [&[data-panel-group-direction=vertical]>div]:rotate-90'
```

(The `after:w-1` + `hover:bg-accent/10` gives a 4px hover surface for the drag handle — visible only on hover, no permanent visual line.)

- [ ] **Step 3: Run check:all**

Run: `bun run check:all`
Expected: PASS. Update any snapshot test.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/
git commit -m "refactor(ui): override remaining primitives + sidebar + resizable"
```

- [ ] **Step 5: Run full check:all + report**

Run: `bun run check:all`
Expected: PASS. End of Phase 3. The UI shell now picks up the new tokens but the structural layout (3 panels, "Tauri App" title, top tabs) is still old.

---

## Phase 4 — App shell (consolidated sidebar + 2-panel layout)

### Task 4.1: Rewrite `TitleBarContent` (Monogram + breadcrumb + ⌘K hint)

**Files:**

- Modify: `src/components/titlebar/TitleBarContent.tsx` (entire file)
- Modify: `src/components/titlebar/TitleBar.tsx` (pass workspace context)
- Modify: `src/components/titlebar/MacOSWindowControls.tsx` (no change to controls themselves, but verify spacing)
- Modify: `src/components/titlebar/WindowsWindowControls.tsx` (same)
- Modify: `src/components/titlebar/LinuxTitleBar.tsx` (same)
- Test: `src/components/titlebar/` — no dedicated test, but the snapshot in the integration test must update

- [ ] **Step 1: Add `useWorkspace` to TitleBar (path is available via the existing store)**

In `src/components/titlebar/TitleBar.tsx`, replace the `TitleBar` function body to fetch the repo path and pass it down:

```tsx
import { useWorkspaceStore } from '@/store/workspace-store'

export function TitleBar({ className, title, forcePlatform }: TitleBarProps) {
  const { t } = useTranslation()
  const repoPath = useWorkspaceStore(s => s.repoPath)
  const displayTitle = title ?? t('titlebar.default')
  const detectedPlatform = usePlatform()
  const platform =
    import.meta.env.DEV && forcePlatform ? forcePlatform : detectedPlatform

  if (platform === 'linux') {
    return (
      <LinuxTitleBar
        className={className}
        title={displayTitle}
        repoPath={repoPath}
      />
    )
  }
  if (platform === 'windows') {
    return (
      <div
        data-tauri-drag-region
        className={cn(
          'relative flex h-[38px] w-full shrink-0 items-center justify-between border-b border-[color:var(--border)] bg-[color:var(--sidebar)]',
          className
        )}
      >
        <div className="flex items-center pl-2">
          <TitleBarLeftActions />
        </div>
        <TitleBarTitle title={displayTitle} repoPath={repoPath} />
        <div className="flex items-center">
          <TitleBarRightActions />
          <WindowsWindowControls />
        </div>
      </div>
    )
  }
  return (
    <div
      data-tauri-drag-region
      className={cn(
        'relative flex h-[38px] w-full shrink-0 items-center justify-between border-b border-[color:var(--border)] bg-[color:var(--sidebar)] backdrop-blur-xl',
        className
      )}
    >
      <div className="flex items-center">
        <MacOSWindowControls />
        <TitleBarLeftActions />
      </div>
      <TitleBarTitle title={displayTitle} repoPath={repoPath} />
      <div className="flex items-center pr-2 gap-1">
        <CommandPaletteHint />
        <TitleBarRightActions />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Rewrite `TitleBarContent.tsx`**

```tsx
import { useTranslation } from 'react-i18next'
import { Command, PanelLeft, PanelLeftClose, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUIStore } from '@/store/ui-store'
import { executeCommand, useCommandContext } from '@/lib/commands'
import { Monogram } from '@/components/atoms'
import { palette } from '@/lib/design-tokens'
import { cn } from '@/lib/utils'

/**
 * Left-side actions (sidebar toggle).
 */
export function TitleBarLeftActions() {
  const { t } = useTranslation()
  const leftSidebarVisible = useUIStore(state => state.leftSidebarVisible)
  const toggleLeftSidebar = useUIStore(state => state.toggleLeftSidebar)
  return (
    <div className="flex items-center gap-1">
      <Button
        onClick={toggleLeftSidebar}
        variant="ghost"
        size="icon"
        className="size-7 text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
        title={t(
          leftSidebarVisible
            ? 'titlebar.hideLeftSidebar'
            : 'titlebar.showLeftSidebar'
        )}
        data-testid="titlebar-toggle-left"
      >
        {leftSidebarVisible ? (
          <PanelLeftClose className="size-3.5" />
        ) : (
          <PanelLeft className="size-3.5" />
        )}
      </Button>
    </div>
  )
}

/**
 * Right-side actions (settings, sidebar toggle).
 */
export function TitleBarRightActions() {
  const { t } = useTranslation()
  const rightSidebarVisible = useUIStore(state => state.rightSidebarVisible)
  const toggleRightSidebar = useUIStore(state => state.toggleRightSidebar)
  const commandContext = useCommandContext()

  const handleOpenPreferences = async () => {
    const result = await executeCommand('open-preferences', commandContext)
    if (!result.success && result.error) {
      commandContext.showToast(result.error, 'error')
    }
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        onClick={handleOpenPreferences}
        variant="ghost"
        size="icon"
        className="size-7 text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
        title={t('titlebar.settings')}
        data-testid="titlebar-settings"
      >
        <Settings className="size-3.5" />
      </Button>
    </div>
  )
}

interface TitleBarTitleProps {
  title?: string
  repoPath?: string | null
}

function repoBasename(path: string | null | undefined): string | null {
  if (!path) return null
  const parts = path.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? null
}

/**
 * Centered title — Monogram + "Collier" wordmark + workspace breadcrumb.
 */
export function TitleBarTitle({
  title = 'Collier',
  repoPath,
}: TitleBarTitleProps) {
  const { t } = useTranslation()
  const repo = repoBasename(repoPath)
  return (
    <div className="flex items-center gap-2 px-3 select-none">
      <Monogram size={18} data-testid="titlebar-monogram" />
      <span className="text-[12px] font-semibold text-[color:var(--foreground)] tracking-tight">
        {title}
      </span>
      {repo ? (
        <>
          <span className="text-[color:var(--muted-foreground)] text-[11px]">
            ·
          </span>
          <span
            className="text-[11px] text-[color:var(--muted-foreground)] font-mono"
            data-testid="titlebar-workspace"
            title={repoPath ?? ''}
          >
            {repo}
          </span>
        </>
      ) : null}
    </div>
  )
}

function CommandPaletteHint() {
  const { t } = useTranslation()
  return (
    <kbd
      className="hidden sm:inline-flex items-center gap-1 px-2 h-6 text-[10px] font-mono text-[color:var(--muted-foreground)] bg-[color:var(--secondary)] rounded-[var(--radius)] border border-[color:var(--border)]"
      title={t('titlebar.openCommandPalette')}
      data-testid="titlebar-cmdk-hint"
    >
      <Command className="size-3" />K
    </kbd>
  )
}
```

- [ ] **Step 3: Update `LinuxTitleBar.tsx` to pass `repoPath` through**

The file is small — replicate the same `Monogram + Collier · {repo}` pattern. Then add the ⌘K hint.

- [ ] **Step 4: Run check:all**

Run: `bun run check:all`
Expected: PASS. Title bar now shows the monogram + workspace.

- [ ] **Step 5: Commit**

```bash
git add src/components/titlebar/
git commit -m "feat(titlebar): Monogram + Collier wordmark + workspace breadcrumb + ⌘K hint"
```

---

### Task 4.2: New consolidated `Sidebar.tsx`

**Files:**

- Create: `src/components/layout/Sidebar.tsx`
- Create: `src/components/layout/Sidebar.test.tsx`
- Modify: `src/components/layout/index.ts` (add Sidebar export)
- Modify: `src/components/beads/issues/FilterSidebar.tsx` — first turn into a re-export shim, then delete in a follow-up
- Modify: `src/components/beads/labels/LabelListView.tsx` — same
- Modify: `src/store/workspace-store.ts` (no change — the `activeView` selector still drives `ViewsRouter`)

- [ ] **Step 1: Write the failing test**

`src/components/layout/Sidebar.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Sidebar } from './Sidebar'

describe('Sidebar', () => {
  it('renders the VIEWS section with all 10 views', () => {
    render(<Sidebar />)
    expect(screen.getByText('List')).toBeInTheDocument()
    expect(screen.getByText('Ready')).toBeInTheDocument()
    expect(screen.getByText('Blocked')).toBeInTheDocument()
    expect(screen.getByText('Search')).toBeInTheDocument()
    expect(screen.getByText('Epics')).toBeInTheDocument()
    expect(screen.getByText('Swarm')).toBeInTheDocument()
    expect(screen.getByText('Sync')).toBeInTheDocument()
    expect(screen.getByText('Worktree')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Raw')).toBeInTheDocument()
  })

  it('renders the FILTERS section label', () => {
    render(<Sidebar />)
    expect(screen.getByText('FILTERS')).toBeInTheDocument()
  })

  it('renders the LABELS section label', () => {
    render(<Sidebar />)
    expect(screen.getByText('LABELS')).toBeInTheDocument()
  })

  it('highlights the active view', () => {
    render(<Sidebar />)
    const listItem = screen.getByRole('button', { name: /List/i })
    expect(listItem.getAttribute('data-active')).toBe('true')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/components/layout/Sidebar.test.tsx` — FAIL.

- [ ] **Step 3: Implement `Sidebar.tsx`**

```tsx
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { SectionLabel } from '@/components/atoms'
import { palette } from '@/lib/design-tokens'
import {
  useWorkspaceStore,
  WORKSPACE_VIEWS,
  type WorkspaceView,
} from '@/store/workspace-store'
import { useIssueFilterStore } from '@/store/issue-filter-store'
import { commands } from '@/lib/tauri-bindings'

const VIEW_LABELS: Record<WorkspaceView, string> = {
  list: 'List',
  ready: 'Ready',
  blocked: 'Blocked',
  search: 'Search',
  epic: 'Epics',
  swarm: 'Swarm',
  sync: 'Sync',
  worktree: 'Worktree',
  status: 'Status',
  raw: 'Raw',
}

export function Sidebar() {
  const { t } = useTranslation()
  const activeView = useWorkspaceStore(s => s.activeView)
  const setActiveView = useWorkspaceStore(s => s.setActiveView)
  const repoPath = useWorkspaceStore(s => s.repoPath)

  // Filter store (count badges in the FILTERS section)
  const status = useIssueFilterStore(s => s.status)
  const priority = useIssueFilterStore(s => s.priority)
  const issueType = useIssueFilterStore(s => s.type)

  // Labels query
  const labelsQuery = useQuery({
    queryKey: ['beads', 'labels', repoPath],
    queryFn: async () => {
      if (repoPath === null) return []
      const r = await commands.bdLabelListAll(repoPath)
      if (r.status === 'ok') return r.data
      throw r.error
    },
    enabled: repoPath !== null,
  })

  const sortedLabels = useMemo(
    () =>
      (labelsQuery.data ?? [])
        .slice()
        .sort((a, b) => a.label.localeCompare(b.label)),
    [labelsQuery.data]
  )

  return (
    <aside
      className="flex h-full w-full flex-col border-r border-[color:var(--border)] bg-[color:var(--sidebar)] backdrop-blur-xl"
      data-testid="sidebar"
    >
      <div className="flex-1 overflow-y-auto px-2 py-3">
        {/* VIEWS */}
        <SectionLabel>{t('sidebar.sections.views')}</SectionLabel>
        <ul role="list" className="flex flex-col gap-0.5">
          {WORKSPACE_VIEWS.map(view => {
            const isActive = view === activeView
            return (
              <li key={view}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  data-active={isActive}
                  data-testid={`sidebar-view-${view}`}
                  onClick={() => setActiveView(view)}
                  className={cn(
                    'flex w-full items-center justify-between h-7 px-2 rounded-[var(--radius)] text-[12px] transition-colors',
                    isActive
                      ? 'bg-[color:var(--accent)]/20 text-[color:var(--accent)] font-medium'
                      : 'text-[color:var(--foreground)] hover:bg-[color:var(--sidebar-accent)]'
                  )}
                >
                  <span>{VIEW_LABELS[view]}</span>
                </button>
              </li>
            )
          })}
        </ul>

        {/* FILTERS */}
        <SectionLabel>{t('sidebar.sections.filters')}</SectionLabel>
        <ul role="list" className="flex flex-col gap-0.5">
          <li>
            <button
              type="button"
              data-testid="sidebar-filter-status"
              className="flex w-full items-center justify-between h-7 px-2 rounded-[var(--radius)] text-[12px] text-[color:var(--foreground)] hover:bg-[color:var(--sidebar-accent)]"
            >
              <span>Status</span>
              <span className="text-[10px] text-[color:var(--muted-foreground)] font-mono">
                ({status.length})
              </span>
            </button>
          </li>
          <li>
            <button
              type="button"
              data-testid="sidebar-filter-priority"
              className="flex w-full items-center justify-between h-7 px-2 rounded-[var(--radius)] text-[12px] text-[color:var(--foreground)] hover:bg-[color:var(--sidebar-accent)]"
            >
              <span>Priority</span>
              <span className="text-[10px] text-[color:var(--muted-foreground)] font-mono">
                ({priority.length})
              </span>
            </button>
          </li>
          <li>
            <button
              type="button"
              data-testid="sidebar-filter-type"
              className="flex w-full items-center justify-between h-7 px-2 rounded-[var(--radius)] text-[12px] text-[color:var(--foreground)] hover:bg-[color:var(--sidebar-accent)]"
            >
              <span>Type</span>
              <span className="text-[10px] text-[color:var(--muted-foreground)] font-mono">
                ({issueType.length})
              </span>
            </button>
          </li>
        </ul>

        {/* LABELS */}
        <SectionLabel>{t('sidebar.sections.labels')}</SectionLabel>
        <ul role="list" className="flex flex-col gap-0.5">
          {sortedLabels.length === 0 ? (
            <li
              className="px-2 py-1 text-[11px] italic text-[color:var(--muted-foreground)]"
              data-testid="sidebar-labels-empty"
            >
              —
            </li>
          ) : (
            sortedLabels.map(l => (
              <li key={l.label}>
                <button
                  type="button"
                  data-testid={`sidebar-label-${l.label}`}
                  data-count={l.count}
                  className="flex w-full items-center gap-2 h-7 px-2 rounded-[var(--radius)] text-[12px] text-[color:var(--foreground)] hover:bg-[color:var(--sidebar-accent)]"
                >
                  <span
                    aria-hidden="true"
                    className="size-2 rounded-[2px] bg-[color:var(--sidebar-accent-foreground)]/30"
                  />
                  <span className="flex-1 text-start truncate">{l.label}</span>
                  <span className="text-[10px] text-[color:var(--muted-foreground)] font-mono">
                    {l.count}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </aside>
  )
}

export default Sidebar
```

- [ ] **Step 4: Update `src/components/layout/index.ts`**

```ts
export { MainWindow } from './MainWindow'
export { MainWindowContent } from './MainWindowContent'
export { Sidebar } from './Sidebar'
```

- [ ] **Step 5: Convert `FilterSidebar.tsx` + `LabelListView.tsx` to re-export shims**

In `src/components/beads/issues/FilterSidebar.tsx`, replace the entire file body with:

```ts
/**
 * @deprecated Moved to `@/components/layout/Sidebar.tsx`. This shim is
 * kept for one commit so consumers that import `FilterSidebar` from
 * this path don't break. Delete in a follow-up.
 */
export { Sidebar as FilterSidebar } from '@/components/layout/Sidebar'
```

In `src/components/beads/labels/LabelListView.tsx`, same pattern:

```ts
/**
 * @deprecated Moved to `@/components/layout/Sidebar.tsx`. This shim is
 * kept for one commit so consumers that import `LabelListView` from
 * this path don't break. Delete in a follow-up.
 */
export { Sidebar as LabelListView } from '@/components/layout/Sidebar'
```

- [ ] **Step 6: Run check:all**

Run: `bun run check:all`
Expected: PASS. The old `LeftSideBar` / `RightSideBar` still work because `FilterSidebar` and `LabelListView` are still importable.

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/components/layout/Sidebar.test.tsx \
        src/components/layout/index.ts \
        src/components/beads/issues/FilterSidebar.tsx \
        src/components/beads/labels/LabelListView.tsx
git commit -m "feat(sidebar): add consolidated Sidebar (Views + Filters + Labels)"
```

---

### Task 4.3: `MainWindowContent` page-header pattern + remove `ViewTabs`

**Files:**

- Modify: `src/components/layout/MainWindowContent.tsx` (entire file)
- Delete: `src/components/beads/ViewTabs.tsx` (use `rm -f`)
- Delete: `src/components/beads/ViewTabs.test.tsx` (if present — `rm -f`)
- Modify: `src/components/beads/ViewsRouter.tsx` (no structural change — still routes by `activeView`)

- [ ] **Step 1: Rewrite `MainWindowContent.tsx`**

```tsx
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { useWorkspaceStore } from '@/store/workspace-store'
import { useBeadsInvalidation } from '@/hooks/useBeadsInvalidation'
import { ViewsRouter } from '@/components/beads/ViewsRouter'
import { IssueDetailDrawer } from '@/components/beads/IssueDetailDrawer'
import { Button } from '@/components/ui/button'
import { useUIStore } from '@/store/ui-store'
import { executeCommand, useCommandContext } from '@/lib/commands'

const PAGE_TITLES: Record<string, string> = {
  list: 'All issues',
  ready: 'Ready to work',
  blocked: 'Blocked',
  search: 'Search',
  epic: 'Epics',
  swarm: 'Swarm',
  sync: 'Sync status',
  worktree: 'Worktrees',
  status: 'Status',
  raw: 'Raw command',
}

export function MainWindowContent() {
  const { t } = useTranslation()
  const repoPath = useWorkspaceStore(s => s.repoPath)
  const activeView = useWorkspaceStore(s => s.activeView)
  const selectedIssueId = useWorkspaceStore(s => s.selectedIssueId)
  const openIssue = useWorkspaceStore(s => s.openIssue)
  const closeIssue = useWorkspaceStore(s => s.closeIssue)
  const commandContext = useCommandContext()
  const toggleCommandPalette = useUIStore(s => s.toggleCommandPalette)

  useBeadsInvalidation()

  if (repoPath === null) {
    return (
      <div className="flex h-full flex-1 items-center justify-center text-[color:var(--muted-foreground)]">
        {t('main.noWorkspaceSelected', 'No workspace selected.')}
      </div>
    )
  }

  const handleNewIssue = async () => {
    const r = await executeCommand('create-issue', commandContext)
    if (!r.success && r.error) commandContext.showToast(r.error, 'error')
  }

  return (
    <div className="flex h-full flex-col bg-[color:var(--background)]">
      {/* Page header */}
      <header
        className="flex h-10 shrink-0 items-center justify-between px-6 border-b border-[color:var(--border)]"
        data-testid="page-header"
      >
        <div className="flex items-center gap-2">
          <h1
            className="text-[13px] font-semibold text-[color:var(--foreground)]"
            data-testid="page-title"
          >
            {PAGE_TITLES[activeView] ?? activeView}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {activeView === 'list' || activeView === 'ready' ? (
            <Button
              onClick={handleNewIssue}
              size="sm"
              variant="default"
              data-testid="page-header-new-issue"
            >
              <Plus className="size-3.5" />
              {t('sidebar.newIssue')}
            </Button>
          ) : null}
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-hidden" data-testid="main-viewport">
        <ViewsRouter cwd={repoPath} onOpenIssue={openIssue} />
      </div>

      {selectedIssueId !== null ? (
        <IssueDetailDrawer
          cwd={repoPath}
          issueId={selectedIssueId}
          onClose={closeIssue}
          onOpenIssue={openIssue}
        />
      ) : null}
    </div>
  )
}
```

- [ ] **Step 2: Delete `ViewTabs.tsx` (and its test if present)**

Run: `rm -f src/components/beads/ViewTabs.tsx src/components/beads/ViewTabs.test.tsx`

- [ ] **Step 3: Run check:all**

Run: `bun run check:all`
Expected: PASS. The old `MainWindowContent` test (if any) needs to be updated — it likely imports ViewTabs. Update the test to import the new structure.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/MainWindowContent.tsx \
        src/components/beads/ViewTabs.tsx \
        src/components/beads/ViewTabs.test.tsx
git commit -m "feat(layout): page-header pattern, drop ViewTabs"
```

---

### Task 4.4: `MainWindow` 2-panel + delete `LeftSideBar` / `RightSideBar`

**Files:**

- Modify: `src/components/layout/MainWindow.tsx` (entire file)
- Delete: `src/components/layout/LeftSideBar.tsx` (and test if any) — `rm -f`
- Delete: `src/components/layout/RightSideBar.tsx` (and test if any) — `rm -f`
- Modify: `src/components/layout/index.ts` (remove old exports)

- [ ] **Step 1: Rewrite `MainWindow.tsx`**

```tsx
import { useEffect } from 'react'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'
import { TitleBar } from '@/components/titlebar/TitleBar'
import { Sidebar } from '@/components/layout/Sidebar'
import { MainWindowContent } from '@/components/layout/MainWindowContent'
import { CommandPalette } from '@/components/command-palette/CommandPalette'
import { PreferencesDialog } from '@/components/preferences/PreferencesDialog'
import { Toaster } from 'sonner'
import { useTheme } from '@/hooks/use-theme'
import { useUIStore } from '@/store/ui-store'
import { useWorkspaceStore } from '@/store/workspace-store'
import { useMainWindowEventListeners } from '@/hooks/useMainWindowEventListeners'
import { commands } from '@/lib/tauri-bindings'
import { logger } from '@/lib/logger'
import { cn } from '@/lib/utils'

const LAYOUT = {
  sidebar: { default: 20, min: 17, max: 30 },
  main: { min: 40 },
} as const

const MAIN_DEFAULT = 100 - LAYOUT.sidebar.default

export function MainWindow() {
  const { theme } = useTheme()
  const sidebarVisible = useUIStore(s => s.sidebarVisible)
  const repoPath = useWorkspaceStore(s => s.repoPath)

  useMainWindowEventListeners()

  useEffect(() => {
    if (repoPath === null) return
    commands.attachWatchRepo(repoPath).catch(err => {
      logger.warn('Failed to attach watcher', { err })
    })
  }, [repoPath])

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden rounded-[var(--app-corner-radius)] bg-[color:var(--background)]">
      <TitleBar />

      <div className="flex flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          <ResizablePanel
            defaultSize={LAYOUT.sidebar.default}
            minSize={LAYOUT.sidebar.min}
            maxSize={LAYOUT.sidebar.max}
            className={cn(!sidebarVisible && 'hidden')}
          >
            <Sidebar />
          </ResizablePanel>

          <ResizableHandle className={cn(!sidebarVisible && 'hidden')} />

          <ResizablePanel defaultSize={MAIN_DEFAULT} minSize={LAYOUT.main.min}>
            <MainWindowContent />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <CommandPalette />
      <PreferencesDialog />
      <Toaster
        position="bottom-right"
        theme={
          theme === 'dark' ? 'dark' : theme === 'light' ? 'light' : 'system'
        }
        className="toaster group"
        toastOptions={{
          classNames: {
            toast:
              'group toast group-[.toaster]:bg-[color:var(--popover)] group-[.toaster]:backdrop-blur-xl group-[.toaster]:text-[color:var(--popover-foreground)] group-[.toaster]:border group-[.toaster]:border-[color:var(--border)] group-[.toaster]:shadow-lg',
            description: 'group-[.toast]:text-[color:var(--muted-foreground)]',
            actionButton:
              'group-[.toast]:bg-[color:var(--primary)] group-[.toast]:text-[color:var(--primary-foreground)]',
            cancelButton:
              'group-[.toast]:bg-[color:var(--muted)] group-[.toast]:text-[color:var(--muted-foreground)]',
          },
        }}
      />
    </div>
  )
}
```

- [ ] **Step 2: Update `useUIStore` to add `sidebarVisible` (replaces `leftSidebarVisible`)**

In `src/store/ui-store.ts`, add a `sidebarVisible: true` to the state, a `toggleSidebar()` action, and a `setSidebarVisible(b)` action. Keep `leftSidebarVisible` as a deprecated alias for the title bar's toggle button:

```ts
// In the state interface
sidebarVisible: boolean
// (deprecated) keep leftSidebarVisible as an alias to sidebarVisible
leftSidebarVisible: boolean
// actions
toggleSidebar: () => void
setSidebarVisible: (b: boolean) => void
```

In the actions:

```ts
toggleSidebar: () => set(s => ({ sidebarVisible: !s.sidebarVisible, leftSidebarVisible: !s.leftSidebarVisible })),
setSidebarVisible: (b) => set({ sidebarVisible: b, leftSidebarVisible: b }),
```

- [ ] **Step 3: Delete the old sidebars**

Run: `rm -f src/components/layout/LeftSideBar.tsx src/components/layout/LeftSideBar.test.tsx src/components/layout/RightSideBar.tsx src/components/layout/RightSideBar.test.tsx`

- [ ] **Step 4: Update `src/components/layout/index.ts`**

```ts
export { MainWindow } from './MainWindow'
export { MainWindowContent } from './MainWindowContent'
export { Sidebar } from './Sidebar'
```

- [ ] **Step 5: Run check:all**

Run: `bun run check:all`
Expected: PASS. Update any snapshot tests that pinned the 3-panel layout.

- [ ] **Step 6: Commit**

```bash
git add src/components/layout/ src/store/ui-store.ts
git commit -m "refactor(layout): 2-panel layout (Sidebar + Main), delete old sidebars"
```

- [ ] **Step 7: Visual verification**

Ask the user to run `bun run dev` and confirm the layout. Use the tauri-mcp server to take a screenshot. The window should now show: title bar (Monogram + "Collier · {repo}" + ⌘K hint), a 240px-wide sidebar with 3 sections (VIEWS, FILTERS, LABELS), and the main content area.

End of Phase 4.

---

## Phase 5 — Views refresh

### Task 5.1: `IssueListView` row refresh (use new atoms)

**Files:**

- Modify: `src/components/beads/issues/IssueListView.tsx` (row visuals only — keep the windowing math)
- Modify: `src/components/beads/issues/badges/PriorityDot.tsx` (re-export shim → `PriorityBadge`)
- Modify: `src/components/beads/issues/badges/StatusPill.tsx` (re-export shim → `StatusDot`)
- Modify: `src/components/beads/issues/badges/LabelChip.tsx` (border + radius update)
- Modify: `src/components/beads/issues/badges/TypeIcon.tsx` (no change — already good)

- [ ] **Step 1: Convert `PriorityDot.tsx` + `StatusPill.tsx` to shims**

```ts
// src/components/beads/issues/badges/PriorityDot.tsx
export { PriorityBadge as PriorityDot } from '@/components/atoms'
```

```ts
// src/components/beads/issues/badges/StatusPill.tsx
export { StatusDot as StatusPill } from '@/components/atoms'
```

- [ ] **Step 2: Update `LabelChip.tsx` for the new border + radius**

Replace the `chipStyle` const in `src/components/beads/issues/badges/LabelChip.tsx`:

```ts
const chipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: space[1],
  height: 20,
  paddingInline: space[2],
  backgroundColor: 'rgba(255, 255, 255, 0.04)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: 4,
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.xs,
  fontWeight: type.fontWeight.medium,
  lineHeight: type.lineHeight.tight,
  color: '#fafafa',
}
```

- [ ] **Step 3: Update `IssueListView.tsx` row visuals**

In `src/components/beads/issues/IssueListView.tsx`, replace the `rowStyle` const and the `IssueRow` component. The windowing math (`scrollRef`, `scrollTop`, `visibleCount`, `startIdx`, `endIdx`, `topPad`, `bottomPad`) is **unchanged**.

```ts
const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space[2],
  height: 36,
  paddingInline: space[3],
  borderRadius: radius.sm,
  cursor: 'pointer',
  transition: 'background-color 80ms cubic-bezier(0.2, 0, 0, 1)',
  backgroundColor: 'transparent',
}
```

In the `IssueRow` component, add an `onMouseEnter` / `onMouseLeave` that toggles a local `hovered` boolean to set `backgroundColor` to `'rgba(94, 106, 210, 0.08)'` on hover.

- [ ] **Step 4: Run check:all + commit**

Run: `bun run check:all` — PASS (update snapshots).

```bash
git add src/components/beads/issues/
git commit -m "feat(issues): row visuals refresh + new badge shims"
```

---

### Task 5.2: `ReadyView` / `BlockedView` / `SearchView`

**Files:**

- Modify: `src/components/beads/issues/ReadyView.tsx`
- Modify: `src/components/beads/issues/BlockedView.tsx`
- Modify: `src/components/beads/issues/SearchView.tsx`
- Modify: `src/components/beads/issues/IssueCreateForm.tsx` (input restyle)

- [ ] **Step 1: Refresh the page-header for each view (page title is in `MainWindowContent` already — just verify the views render their content)**

Each view should:

- Render rows in the new style (delegates to `IssueRow` from `IssueListView` if it makes sense).
- Use the new `EmptyState` atom for the empty path.
- For `SearchView`, add a search input in the page header — actually, since the page header is now in `MainWindowContent`, the search input needs to live in the view itself at the top of the content area. Style it: full-width, 9px margin, `h-9`, `bg-[color:var(--secondary)]`, `border-[color:var(--border)]`, `rounded-[var(--radius)]`, with a `<Search>` icon prefix.

- [ ] **Step 2: Replace inline empty states with `EmptyState` atom**

In each view's empty branch, use the new `EmptyState` from `@/components/atoms`. Example for `ReadyView`:

```tsx
import { EmptyState } from '@/components/atoms'
import { Inbox } from 'lucide-react'

if (issues.length === 0) {
  return (
    <EmptyState
      icon={Inbox}
      title="No ready work"
      body="When issues are unblocked, they'll show up here."
    />
  )
}
```

- [ ] **Step 3: Run check:all + commit**

Run: `bun run check:all` — PASS. Update tests.

```bash
git add src/components/beads/issues/
git commit -m "feat(views): Ready/Blocked/Search empty states + search input restyle"
```

---

### Task 5.3: `EpicView` / `SwarmView` / `SyncStatusView` / `WorktreeListView` / `StatusOverviewView` / `RawCommandPanel`

**Files:**

- Modify: `src/components/beads/views/EpicView.tsx`
- Modify: `src/components/beads/views/SwarmView.tsx`
- Modify: `src/components/beads/views/SyncStatusView.tsx`
- Modify: `src/components/beads/views/WorktreeListView.tsx`
- Modify: `src/components/beads/views/StatusOverviewView.tsx` (becomes a 2-column metric card grid)
- Modify: `src/components/beads/raw/RawCommandPanel.tsx` (restyled input + output)
- Modify: `src/components/beads/EmptyStates.tsx` (re-export from atoms)

- [ ] **Step 1: Replace each view's empty state with the `EmptyState` atom**

For each view, locate the "no data" branch and use `EmptyState`. Examples:

- `EpicView` empty: "No epics yet" / "Group related issues into milestones."
- `SwarmView` empty: "No swarm activity" / "Multiple-agent sessions will appear here."
- `SyncStatusView` empty: "Not yet synced" / "Run `bd sync` to push the local state."
- `WorktreeListView` empty: "No worktrees" / "Run `git worktree add` to create one."
- `StatusOverviewView` empty: "No data yet" / "Once you create issues, the overview populates."
- `RawCommandPanel` empty: "No command run" / "Type a `bd` command above to start."

- [ ] **Step 2: Restyle `StatusOverviewView` as a 2-column metric card grid**

Replace the view's main render with:

```tsx
import { Card } from '@/components/ui/card'
import { palette } from '@/lib/design-tokens'

const metrics = [
  { label: 'Open', value: stats.open, color: palette.statusOpen },
  {
    label: 'In progress',
    value: stats.in_progress,
    color: palette.statusInProgress,
  },
  { label: 'Blocked', value: stats.blocked, color: palette.statusBlocked },
  { label: 'Closed', value: stats.closed, color: palette.statusClosed },
]

return (
  <div className="grid grid-cols-2 gap-3 p-6">
    {metrics.map(m => (
      <Card
        key={m.label}
        className="p-4 bg-[color:var(--card)] border-[color:var(--border)]"
      >
        <div className="text-[11px] uppercase tracking-[0.08em] text-[color:var(--muted-foreground)] font-semibold">
          {m.label}
        </div>
        <div className="flex items-baseline gap-2 mt-2">
          <span
            className="text-[32px] font-semibold"
            style={{ color: m.color }}
          >
            {m.value}
          </span>
          <span className="text-[12px] text-[color:var(--muted-foreground)] font-mono">
            issues
          </span>
        </div>
      </Card>
    ))}
  </div>
)
```

- [ ] **Step 3: Restyle `RawCommandPanel`**

In `src/components/beads/raw/RawCommandPanel.tsx`:

- Input: `bg-[color:var(--secondary)] border-[color:var(--border)] rounded-[var(--radius)] h-9 px-3 font-mono text-[12px]`
- Output: `bg-[color:var(--card)] border-l border-[color:var(--border)] font-mono text-[12px] p-3 overflow-y-auto`
- The "Copy CLI command" / "Coming in v1.1" empty state → use the `EmptyState` atom with the Terminal icon.

- [ ] **Step 4: Refactor `EmptyStates.tsx` to re-export from atoms**

Replace the entire content of `src/components/beads/EmptyStates.tsx` with:

```ts
export { EmptyState } from '@/components/atoms'
```

- [ ] **Step 5: Run check:all + commit**

Run: `bun run check:all` — PASS. Update tests.

```bash
git add src/components/beads/views/ src/components/beads/raw/ src/components/beads/EmptyStates.tsx
git commit -m "feat(views): refresh 6 views + StatusOverview as metric grid + EmptyState atom"
```

---

## Phase 6 — Overlays

### Task 6.1: `IssueDetailDrawer` (backdrop-blur + slide animation)

**Files:**

- Modify: `src/components/beads/IssueDetailDrawer.tsx` (entire file)

- [ ] **Step 1: Rewrite the drawer**

```tsx
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { IssueDetailView } from './issues/IssueDetailView'
import { Button } from '@/components/ui/button'
import { palette } from '@/lib/design-tokens'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export interface IssueDetailDrawerProps {
  cwd: string
  issueId: string
  onClose: () => void
  onOpenIssue?: (id: string) => void
}

export function IssueDetailDrawer({
  cwd,
  issueId,
  onClose,
  onOpenIssue,
}: IssueDetailDrawerProps) {
  const { t } = useTranslation()
  const panelRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null
    closeButtonRef.current?.focus()
    return () => {
      previouslyFocusedRef.current?.focus()
    }
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (panel === null) return
      const focusable = panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      if (focusable.length === 0) {
        e.preventDefault()
        return
      }
      const first = focusable.item(0)
      const last = focusable.item(focusable.length - 1)
      const active = document.activeElement as HTMLElement | null
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/40 animate-in fade-in-0 duration-200"
      onClick={onClose}
      data-testid="issue-detail-drawer"
    >
      <div
        ref={panelRef}
        className="h-full w-full max-w-[480px] overflow-y-auto border-l border-[color:var(--border)] bg-[color:var(--drawer)] text-[color:var(--foreground)] shadow-2xl"
        style={{
          backgroundColor: 'rgba(20, 20, 20, 0.92)',
          backdropFilter: 'blur(24px)',
        }}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('beads.issueDetail.title', 'Issue details')}
        tabIndex={-1}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 h-10 border-b border-[color:var(--border)] bg-[color:var(--card)]">
          <h2 className="text-[13px] font-semibold">
            {t('beads.issueDetail.title', 'Issue details')}
          </h2>
          <Button
            ref={closeButtonRef}
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label={t('common.close', 'Close')}
            data-testid="issue-detail-close"
          >
            <X className="size-4" />
          </Button>
        </div>
        <IssueDetailView
          cwd={cwd}
          issueId={issueId}
          onClose={onClose}
          onOpenIssue={onOpenIssue}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run check:all + commit**

Run: `bun run check:all` — PASS.

```bash
git add src/components/beads/IssueDetailDrawer.tsx
git commit -m "feat(drawer): backdrop-blur + new radius + 480px width"
```

---

### Task 6.2: `CommandPalette` (Monogram header)

**Files:**

- Modify: `src/components/command-palette/CommandPalette.tsx` (small change — add Monogram to the dialog header)

- [ ] **Step 1: Add Monogram above the command input**

In `src/components/command-palette/CommandPalette.tsx`, locate the `CommandDialog` content. Add a header row above `<CommandInput>`:

```tsx
<CommandDialog ...>
  <div className="flex items-center gap-2 px-3 py-2 border-b border-[color:var(--border)]">
    <Monogram size={18} />
    <span className="text-[12px] font-semibold text-[color:var(--foreground)]">Collier</span>
    <span className="ml-auto text-[10px] font-mono text-[color:var(--muted-foreground)]">⌘K</span>
  </div>
  <CommandInput ... />
  ...
</CommandDialog>
```

- [ ] **Step 2: Run check:all + commit**

Run: `bun run check:all` — PASS.

```bash
git add src/components/command-palette/
git commit -m "feat(command-palette): add Monogram header above the search input"
```

---

### Task 6.3: `PreferencesDialog` (icon-strip nav) + panes

**Files:**

- Modify: `src/components/preferences/PreferencesDialog.tsx` (replace the shadcn `Sidebar` nav with a 56px icon strip)
- Modify: `src/components/preferences/panes/GeneralPane.tsx` (token refresh via overridden primitives — no structural change)
- Modify: `src/components/preferences/panes/AppearancePane.tsx` (same)
- Modify: `src/components/preferences/panes/AdvancedPane.tsx` (same)
- Modify: `src/components/preferences/shared/SettingsComponents.tsx` (token refresh)

- [ ] **Step 1: Rewrite `PreferencesDialog.tsx`**

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Settings, Palette, Zap } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { useUIStore } from '@/store/ui-store'
import { GeneralPane } from './panes/GeneralPane'
import { AppearancePane } from './panes/AppearancePane'
import { AdvancedPane } from './panes/AdvancedPane'
import { cn } from '@/lib/utils'

type Pane = 'general' | 'appearance' | 'advanced'

const nav: { id: Pane; icon: typeof Settings; labelKey: string }[] = [
  { id: 'general', icon: Settings, labelKey: 'preferences.general' },
  { id: 'appearance', icon: Palette, labelKey: 'preferences.appearance' },
  { id: 'advanced', icon: Zap, labelKey: 'preferences.advanced' },
]

export function PreferencesDialog() {
  const { t } = useTranslation()
  const [pane, setPane] = useState<Pane>('general')
  const open = useUIStore(s => s.preferencesOpen)
  const setOpen = useUIStore(s => s.setPreferencesOpen)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 md:max-h-[600px] md:max-w-[860px] bg-[color:var(--popover)] backdrop-blur-xl">
        <DialogTitle className="sr-only">{t('preferences.title')}</DialogTitle>
        <DialogDescription className="sr-only">
          {t('preferences.description')}
        </DialogDescription>
        <div className="flex h-[600px]">
          {/* Icon strip */}
          <nav
            aria-label="Preferences navigation"
            className="flex flex-col items-center gap-1 w-14 py-3 border-r border-[color:var(--border)] bg-[color:var(--background)]"
          >
            {nav.map(n => {
              const Icon = n.icon
              const active = pane === n.id
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => setPane(n.id)}
                  aria-current={active ? 'page' : undefined}
                  aria-label={t(n.labelKey)}
                  data-testid={`prefs-nav-${n.id}`}
                  className={cn(
                    'flex items-center justify-center size-10 rounded-[var(--radius)] transition-colors',
                    active
                      ? 'bg-[color:var(--accent)]/20 text-[color:var(--accent)]'
                      : 'text-[color:var(--muted-foreground)] hover:bg-[color:var(--secondary)] hover:text-[color:var(--foreground)]'
                  )}
                >
                  <Icon className="size-4" />
                </button>
              )
            })}
          </nav>
          {/* Pane */}
          <main className="flex-1 overflow-y-auto">
            <header className="flex h-10 items-center px-4 border-b border-[color:var(--border)]">
              <h2 className="text-[13px] font-semibold text-[color:var(--foreground)]">
                {t(`preferences.${pane}`)}
              </h2>
            </header>
            <div className="p-4">
              {pane === 'general' && <GeneralPane />}
              {pane === 'appearance' && <AppearancePane />}
              {pane === 'advanced' && <AdvancedPane />}
            </div>
          </main>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Run check:all + commit**

Run: `bun run check:all` — PASS.

```bash
git add src/components/preferences/
git commit -m "feat(preferences): icon-strip nav, backdrop-blur, new section header"
```

---

## Phase 7 — Icons

### Task 7.1: Generate new app icon source

**Files:**

- Create: `src-tauri/icons/icon.svg`
- Modify (regenerate): `src-tauri/icons/*.png` + `src-tauri/icons/icon.icns` + `src-tauri/icons/icon.ico` (all generated by the CLI in Step 3)
- Modify: `public/favicon.svg`
- Delete: `public/Icon.svg` (the old blue 512px mark)

- [ ] **Step 1: Write the new SVG source**

`src-tauri/icons/icon.svg`:

```svg
<?xml version="1.0" encoding="UTF-8"?>
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1024" y2="1024" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#5e6ad2"/>
      <stop offset="1" stop-color="#7c3aed"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="1024" height="1024" rx="234" fill="url(#g)"/>
  <text x="512" y="700"
        font-family="-apple-system, 'SF Pro Display', 'Inter', system-ui, sans-serif"
        font-size="660" font-weight="700" fill="#ffffff" text-anchor="middle">C</text>
</svg>
```

- [ ] **Step 2: Copy the same SVG to `public/favicon.svg` (32×32 viewBox)**

`public/favicon.svg`:

```svg
<?xml version="1.0" encoding="UTF-8"?>
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#5e6ad2"/>
      <stop offset="1" stop-color="#7c3aed"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="32" height="32" rx="7" fill="url(#g)"/>
  <text x="16" y="23"
        font-family="-apple-system, 'SF Pro Display', 'Inter', system-ui, sans-serif"
        font-size="22" font-weight="700" fill="#ffffff" text-anchor="middle">C</text>
</svg>
```

- [ ] **Step 3: Regenerate all platform icon sizes**

Run:

```bash
npx @tauri-apps/cli icon src-tauri/icons/icon.svg
```

Expected: regenerates `icon.icns`, `icon.ico`, and the 11 PNG sizes (32, 64, 128, 128@2x, 256, 256@2x, 512, 512@2x, 1024, plus 30x30 + 44x44 + 71x71 + 89x89 + 107x107 + 142x142 + 150x150 + 284x284 + 310x310 for Windows store).

- [ ] **Step 4: Delete the old `public/Icon.svg`**

Run: `rm -f public/Icon.svg`

- [ ] **Step 5: Verify in the running app**

Ask the user to:

1. Rebuild: `bun run tauri dev`
2. Check the Finder / Dock icon (macOS) or Windows Explorer / Linux app menu.
3. Take a screenshot via tauri-mcp to confirm the new icon + favicon in the dev window.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/icons/ public/favicon.svg
git rm public/Icon.svg
git commit -m "feat(icons): regenerate Collier icon as gradient 'C' mark"
```

---

## Phase 8 — Validation

### Task 8.1: Full check + visual verification

- [ ] **Step 1: Run `bun run check:all`**

Run: `bun run check:all`
Expected: PASS — all typechecks, lints, formats, ast-grep rules, clippy, vitest suites pass.

If anything fails:

- `bun run typecheck` errors → fix types in the changed files.
- `bun run lint` errors → adjust class strings; rarely a real issue with the override pattern.
- `bun run test` failures → update test assertions for the new tokens. Snapshot tests need `--update` once reviewed.

- [ ] **Step 2: Run the dev app**

Ask the user to:

1. `bun run dev` in the main window.
2. Open a sample repo.
3. Verify the title bar shows "Collier" + the workspace name + the ⌘K hint.
4. Verify the sidebar has 3 sections (VIEWS, FILTERS, LABELS).
5. Click through 3 views (List, Ready, Epics) — page header changes.
6. Open the command palette (⌘K) — Monogram + "Collier" wordmark at the top.
7. Open the issue detail drawer — backdrop-blur, no heavy shadow, 480px width.
8. Open Preferences (⌘,) — icon-strip nav, 3 icons stacked, active icon has accent background.
9. Toggle theme to "light" — verify the light theme renders (the new light tokens in `theme-variables.css`).

- [ ] **Step 3: Take final screenshot**

Use the tauri-mcp server to take a screenshot of the main window. Save to `/tmp/collier-redesign-final.png` for the spec record.

- [ ] **Step 4: Update `docs/developer/ui-patterns.md`**

Add a "Design system" section to the doc. Link to `src/lib/design-tokens.ts` and `src/theme-variables.css`. Note:

- The new dark-default theme + light opt-in.
- The `@supports (backdrop-filter: blur(20px))` pattern for cross-platform vibrancy.
- The 5 atoms in `src/components/atoms/`.
- The shadcn-override pattern (mechanical changes to `rounded-md` etc. → `rounded-[var(--radius)]`).
- The `Monogram` is the canonical brand mark; any new icon set must derive from it.

- [ ] **Step 5: Update `docs/developer/architecture-guide.md` and `docs/developer/README.md`**

Note the consolidated-sidebar pattern in the layout section. The 3-panel → 2-panel change is a structural decision; document the rationale (one keyboard-focusable region, +30% list real estate, no redundant borders).

- [ ] **Step 6: Final commit**

```bash
git add docs/developer/
git commit -m "docs: document the new design system + consolidated-sidebar pattern"
```

End of plan. Total: 25 tasks across 8 phases.
