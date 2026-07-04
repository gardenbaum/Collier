/**
 * Tests for the shared `BootstrapDialog` component.
 *
 * Contract
 * --------
 * `BootstrapDialog` is the chrome used by `BdNotInPath`, `SchemaCheck`,
 * and `VersionCheck`. It owns:
 *   - The `Dialog` / `DialogContent` / `DialogHeader` / `DialogTitle` /
 *     `DialogDescription` / `DialogFooter` skeleton.
 *   - The blocking-modal styling (no close button, no escape, no
 *     pointer-outside dismissal, Bauhaus+Swiss hard-edge treatment).
 *   - The default footer (`<QuitButton />`) when no `footer` prop is
 *     supplied. Callers pass a custom footer when they need extra
 *     actions (Recheck + Quit, releases link + Quit, etc.).
 *
 * Testids the chrome must propagate unchanged (because callers'
 * existing tests rely on them):
 *   - `data-testid` on `DialogContent` when `contentTestid` is set.
 *   - `data-testid` on `DialogTitle` when `titleTestid` is set.
 *
 * The children (body content) and the footer slot are passed through
 * verbatim — callers supply their own testids inside those slots.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'

// React 19 + Vitest: silence "act() not configured" warnings.
;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

// Hoisted mocks — must be declared before the import of the SUT.
const { mockClose } = vi.hoisted(() => ({
  mockClose: vi.fn(),
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    close: mockClose,
  }),
}))

// Logger noise reduction
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

const importSut = () => import('./BootstrapDialog')

beforeEach(() => {
  vi.clearAllMocks()
  mockClose.mockResolvedValue(undefined)
})

describe('BootstrapDialog', () => {
  it('renders the title and description children', async () => {
    const { BootstrapDialog } = await importSut()
    render(
      <BootstrapDialog
        open={true}
        title="Hello title"
        description="Hello description"
      >
        <p>body</p>
      </BootstrapDialog>
    )

    expect(screen.getByText('Hello title')).toBeInTheDocument()
    expect(screen.getByText('Hello description')).toBeInTheDocument()
    expect(screen.getByText('body')).toBeInTheDocument()
  })

  it('renders the default QuitButton footer when no footer prop is supplied', async () => {
    const { BootstrapDialog } = await importSut()
    render(
      <BootstrapDialog open={true} title="t" description="d">
        <span>body</span>
      </BootstrapDialog>
    )

    expect(screen.getByRole('button', { name: /quit/i })).toBeInTheDocument()
  })

  it('replaces the default footer when a custom footer is provided', async () => {
    const { BootstrapDialog } = await importSut()
    render(
      <BootstrapDialog
        open={true}
        title="t"
        description="d"
        footer={
          <>
            <button type="button">Recheck</button>
            <button type="button">Open Releases</button>
          </>
        }
      >
        <span>body</span>
      </BootstrapDialog>
    )

    // Custom footer items are present
    expect(screen.getByRole('button', { name: /recheck/i })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /open releases/i })
    ).toBeInTheDocument()

    // Default QuitButton must NOT be present when a custom footer
    // overrides it — the only quit role comes from the custom footer.
    const quitButtons = screen.queryAllByRole('button', { name: /quit/i })
    expect(quitButtons).toHaveLength(0)
  })

  it('propagates contentTestid to DialogContent', async () => {
    const { BootstrapDialog } = await importSut()
    render(
      <BootstrapDialog
        open={true}
        contentTestid="my-modal"
        title="t"
        description="d"
      >
        <span>body</span>
      </BootstrapDialog>
    )

    expect(screen.getByTestId('my-modal')).toBeInTheDocument()
  })

  it('propagates titleTestid to DialogTitle', async () => {
    const { BootstrapDialog } = await importSut()
    render(
      <BootstrapDialog
        open={true}
        titleTestid="my-title"
        title="Hello"
        description="d"
      >
        <span>body</span>
      </BootstrapDialog>
    )

    expect(screen.getByTestId('my-title')).toBeInTheDocument()
  })

  it('does not render a close button (modal is blocking)', async () => {
    const { BootstrapDialog } = await importSut()
    render(
      <BootstrapDialog open={true} title="t" description="d">
        <span>body</span>
      </BootstrapDialog>
    )

    // Radix DialogContent exposes a close button when showCloseButton
    // is true; BootstrapDialog passes showCloseButton={false}, so the
    // X button must be absent.
    expect(
      screen.queryByRole('button', { name: /close/i })
    ).not.toBeInTheDocument()
  })

  it('default QuitButton closes the current Tauri window', async () => {
    const { BootstrapDialog } = await importSut()
    const user = userEvent.setup()
    render(
      <BootstrapDialog open={true} title="t" description="d">
        <span>body</span>
      </BootstrapDialog>
    )

    const quit = screen.getByRole('button', { name: /quit/i })
    await user.click(quit)

    expect(mockClose).toHaveBeenCalledTimes(1)
  })

  it('does not render the dialog content when open is false', async () => {
    const { BootstrapDialog } = await importSut()
    render(
      <BootstrapDialog open={false} title="Hidden" description="Hidden">
        <span>body</span>
      </BootstrapDialog>
    )

    // When `open` is false Radix Dialog removes its content from the
    // DOM entirely (the modal is blocking and never present at all in
    // the closed state). Assert that no element renders.
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument()
  })
})
