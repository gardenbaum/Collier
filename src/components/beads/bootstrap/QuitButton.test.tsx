/**
 * Tests for the `QuitButton` component.
 *
 * Contract: `<QuitButton />` is the bootstrap-gate "Quit" action used
 * by `BdNotInPath`, `SchemaCheck`, `VersionCheck`, and as the default
 * footer of `BootstrapDialog`. Clicking it calls
 * `getCurrentWindow().close()`; on rejection it routes the error to
 * `logger.error('Failed to close window', { err })` without re-throwing.
 *
 * The button is a Bauhaus/Swiss-styled `<Button>` (hard edges, accent
 * color) with an X icon, a translated `Quit` label, `type="button"`,
 * `border-2`, and an inline style built from `colors.accent` /
 * `colors.mono9` (background/foreground) plus `borderRadius: 0`.
 *
 * Mocks replicate the pattern already proven in
 * `BdNotInPath.test.tsx` and `SchemaCheck.test.tsx` — `getCurrentWindow`
 * and `logger` are swapped for hoisted `vi.fn()`s; the rest of the
 * tree (I18nextProvider via `@/test/test-utils`) is real.
 */
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { render, screen } from '@/test/test-utils'
import userEvent from '@testing-library/user-event'
import { colors } from '@/lib/design-tokens'

// JSDOM normalises inline-style colour values to `rgb(r, g, b)` form
// regardless of how they were specified (hex / named / rgb() input).
// Convert the design-token hex literals to that format so the inline
// assertion compares apples to apples regardless of the underlying
// palette representation.
const hexToRgb = (hex: string): string => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m || m[1] === undefined) {
    throw new Error(`hexToRgb: unexpected hex value ${hex}`)
  }
  const n = parseInt(m[1], 16)
  return `rgb(${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff})`
}

// React 19 + Vitest: silence "act() not configured" warnings.
;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

// Hoisted mocks — must be declared before the SUT is imported so the
// `vi.mock` calls below can capture them.
const { mockClose, mockError } = vi.hoisted(() => ({
  mockClose: vi.fn(),
  mockError: vi.fn(),
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    close: mockClose,
  }),
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    // `error` is the real assertion target — the rest are silenced for
    // test-output hygiene.
    error: mockError,
  },
}))

// Lazy import so the mocks above are wired before the SUT is evaluated
// (mirrors `BdNotInPath.test.tsx` / `SchemaCheck.test.tsx`).
const importSut = () => import('./QuitButton')

beforeEach(() => {
  vi.clearAllMocks()
  // Default: close resolves successfully. Individual tests override
  // this to exercise the rejection path.
  mockClose.mockResolvedValue(undefined)
})

describe('QuitButton', () => {
  describe('rendering', () => {
    it('renders a <button> with the translated "Quit" label', async () => {
      const { QuitButton } = await importSut()
      render(<QuitButton />)

      // The locale file ships no `beads.bootstrap.quit` key, so i18n
      // falls back to the second argument of `t(...)` — the literal
      // "Quit". This is the visible label.
      expect(screen.getByRole('button', { name: /quit/i })).toBeInTheDocument()
    })

    it('renders an X icon with aria-hidden="true"', async () => {
      const { QuitButton } = await importSut()
      const { container } = render(<QuitButton />)

      // The icon is decorative — it lives inside the button alongside
      // the translated text, so screen readers should skip it. We
      // locate by the `lucide-x` class that `lucide-react` always
      // emits for its single-letter icons.
      const icon = container.querySelector('svg.lucide-x')
      expect(icon).not.toBeNull()
      expect(icon).toHaveAttribute('aria-hidden', 'true')
    })

    it('declares type="button" to prevent form-submit side-effects', async () => {
      const { QuitButton } = await importSut()
      render(<QuitButton />)

      // Without `type="button"`, a QuitButton dropped inside a <form>
      // would submit it on click. The component pins this explicitly.
      const btn = screen.getByRole('button', { name: /quit/i })
      expect(btn).toHaveAttribute('type', 'button')
    })

    it('applies className="border-2" verbatim', async () => {
      const { QuitButton } = await importSut()
      render(<QuitButton />)

      const btn = screen.getByRole('button', { name: /quit/i })
      // The component pins `border-2` as a literal class fragment; the
      // underlying `<Button>` also injects its own variant classes via
      // `cn(...)`, so we assert the substring rather than the full
      // className string.
      expect(btn.className).toContain('border-2')
    })

    it('applies the Bauhaus-styled inline style (accent bg + mono9 fg + square corners)', async () => {
      const { QuitButton } = await importSut()
      render(<QuitButton />)

      const btn = screen.getByRole('button', {
        name: /quit/i,
      }) as HTMLButtonElement
      // `colors.accent` is `palette.danger` (`#ef4444`) and
      // `colors.mono9` is `palette.bg` (`#0a0a0a`). These are the
      // inline values pinned by the component — assert against the
      // canonical design tokens (converted to JSDOM's `rgb(...)`
      // serialisation) so future palette tweaks stay in sync.
      expect(btn.style.backgroundColor).toBe(hexToRgb(colors.accent))
      expect(btn.style.color).toBe(hexToRgb(colors.mono9))
      // The accent doubles as the border colour so the band reads as
      // a single block; `borderRadius: 0` enforces the hard-edged
      // Bauhaus look.
      expect(btn.style.borderColor).toBe(hexToRgb(colors.accent))
      expect(btn.style.borderRadius).toBe('0px')
    })
  })

  describe('click behaviour', () => {
    it('clicking the button invokes getCurrentWindow().close() exactly once', async () => {
      const { QuitButton } = await importSut()
      const user = userEvent.setup()
      render(<QuitButton />)

      const btn = screen.getByRole('button', { name: /quit/i })
      await user.click(btn)

      // The SUT awaits the close promise before returning control.
      // `waitFor` keeps the assertion robust against the microtask
      // hop introduced by `async`/`await` inside `handleClick`.
      await vi.waitFor(() => {
        expect(mockClose).toHaveBeenCalledTimes(1)
      })
    })

    it('successful close does not call logger.error', async () => {
      const { QuitButton } = await importSut()
      const user = userEvent.setup()
      render(<QuitButton />)

      const btn = screen.getByRole('button', { name: /quit/i })
      await user.click(btn)

      // Wait for the close to resolve, then assert no error was
      // logged. Asserting *after* `waitFor` avoids a race where the
      // logger call (synchronous in the catch branch) might or might
      // not have run by the time we check.
      await vi.waitFor(() => {
        expect(mockClose).toHaveBeenCalledTimes(1)
      })
      expect(mockError).not.toHaveBeenCalled()
    })
  })

  describe('error path', () => {
    it('rejected close logs the error and does not re-throw', async () => {
      const failure = new Error('window already destroyed')
      mockClose.mockRejectedValueOnce(failure)

      const { QuitButton } = await importSut()
      const user = userEvent.setup()
      render(<QuitButton />)

      const btn = screen.getByRole('button', { name: /quit/i })

      // The SUT explicitly swallows the rejection — clicking must not
      // throw an unhandled rejection into the test runner.
      await expect(user.click(btn)).resolves.not.toThrow()

      // The error is routed to `logger.error` with the exact message
      // and a `{ err }` payload so the original cause is preserved
      // for triage.
      await vi.waitFor(() => {
        expect(mockError).toHaveBeenCalledTimes(1)
      })
      const [message, context] = (mockError as Mock).mock.calls[0] ?? []
      expect(message).toBe('Failed to close window')
      expect(context).toEqual({ err: failure })
    })

    it('a subsequent successful click after a previous failure logs no further errors', async () => {
      // First call rejects, second call resolves. The SUT caches no
      // state in between — each click is independent.
      mockClose
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce(undefined)

      const { QuitButton } = await importSut()
      const user = userEvent.setup()
      render(<QuitButton />)

      const btn = screen.getByRole('button', { name: /quit/i })

      await user.click(btn)
      await vi.waitFor(() => {
        expect(mockError).toHaveBeenCalledTimes(1)
      })

      await user.click(btn)
      await vi.waitFor(() => {
        expect(mockClose).toHaveBeenCalledTimes(2)
      })

      // No second logger.error — the recovered path stays quiet.
      expect(mockError).toHaveBeenCalledTimes(1)
    })
  })

  describe('rendered shape (QuitButton-owned bits)', () => {
    it('composes only the QuitButton-specific className fragment with the underlying <Button>', async () => {
      // A full `toMatchInlineSnapshot` of the className would also
      // pin every class emitted by the shared `<Button>` variant —
      // which has nothing to do with QuitButton and churns for
      // unrelated UI changes. Scope the assertion to the bits
      // QuitButton owns: `border-2` (literal) and the three inline
      // style fields.
      const { QuitButton } = await importSut()
      const { container } = render(<QuitButton />)
      const btn = container.querySelector('button') as HTMLButtonElement

      expect(btn.tagName).toBe('BUTTON')
      expect(btn.getAttribute('type')).toBe('button')
      expect(btn.className).toContain('border-2')
      expect(btn.style.borderRadius).toBe('0px')
      expect(btn.style.backgroundColor).toBe(hexToRgb(colors.accent))
      expect(btn.style.color).toBe(hexToRgb(colors.mono9))
      expect(btn.style.borderColor).toBe(hexToRgb(colors.accent))
    })
  })
})
