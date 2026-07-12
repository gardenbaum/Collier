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
import { act, fireEvent, screen } from '@testing-library/react'
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

  // -------------------------------------------------------------------
  // Blocking-modal behavior: Escape / outside-pointer / outside-interact
  // -------------------------------------------------------------------
  // BootstrapDialog owns three inline event handlers passed to Radix's
  // DialogContent that each call `event.preventDefault()`:
  //   - onEscapeKeyDown: Escape must NOT close the modal
  //   - onPointerDownOutside: pointerdown outside the modal must NOT close it
  //   - onInteractOutside: any interaction outside the modal must NOT close it
  //
  // Without `preventDefault`, Radix would fire `onOpenChange(false)` and
  // (for the pointer / interact cases) unmount the dialog content.
  // Because the dialog is "blocking", callers control `open` themselves
  // and the only meaningful behavior we can assert is that the inline
  // handlers prevent Radix from closing — i.e. the content stays in the
  // DOM after the event fires.

  it('keeps the dialog mounted when Escape is pressed (onEscapeKeyDown preventDefault)', async () => {
    const { BootstrapDialog } = await importSut()
    render(
      <BootstrapDialog
        open={true}
        title="Stays Title"
        description="Stays Description"
      >
        <span>body</span>
      </BootstrapDialog>
    )

    // Sanity: content rendered initially.
    expect(screen.getByText('Stays Title')).toBeInTheDocument()
    expect(screen.getByText('Stays Description')).toBeInTheDocument()
    expect(
      document.querySelector('[data-slot="dialog-content"]')
    ).toBeInTheDocument()

    // Radix listens for Escape in the capture phase on document; firing
    // on document.body reaches it before any other listener.
    await act(async () => {
      fireEvent.keyDown(document.body, { key: 'Escape' })
    })

    // The dialog content must still be in the DOM — i.e. the inline
    // `onEscapeKeyDown` handler called `event.preventDefault()` and
    // Radix did not close the modal.
    expect(screen.getByText('Stays Title')).toBeInTheDocument()
    expect(screen.getByText('Stays Description')).toBeInTheDocument()
    expect(
      document.querySelector('[data-slot="dialog-content"]')
    ).toBeInTheDocument()
  })

  it('keeps the dialog mounted on pointerdown outside the content (onPointerDownOutside + onInteractOutside preventDefault)', async () => {
    const { BootstrapDialog } = await importSut()
    render(
      <BootstrapDialog
        open={true}
        title="Stays Title"
        description="Stays Description"
      >
        <span>body</span>
      </BootstrapDialog>
    )

    // Sanity: dialog rendered.
    expect(screen.getByText('Stays Title')).toBeInTheDocument()
    expect(
      document.querySelector('[data-slot="dialog-content"]')
    ).toBeInTheDocument()

    // Radix's usePointerDownOutside defers attaching its document-level
    // pointerdown listener via setTimeout(0) (see
    // @radix-ui/react-dismissable-layer). Yield once so that timer
    // fires before we dispatch — otherwise the listener isn't installed
    // yet and POINTER_DOWN_OUTSIDE never reaches our handlers.
    await new Promise(resolve => setTimeout(resolve, 0))

    // Radix's usePointerDownOutside also skips events that originate
    // inside the React tree (it sets isPointerInsideReactTreeRef via
    // an onPointerDownCapture handler on the DismissableLayer wrapper).
    // We therefore dispatch the event on a throwaway DOM node that is
    // OUTSIDE React's tree — appended directly to document.body as a
    // sibling of the React root container. Radix's document-level
    // pointerdown listener fires both onPointerDownOutside AND
    // onInteractOutside (see @radix-ui/react-dismissable-layer).
    const outsideNode = document.createElement('div')
    outsideNode.setAttribute('data-testid', 'outside-sibling')
    document.body.appendChild(outsideNode)

    try {
      await act(async () => {
        fireEvent.pointerDown(outsideNode)
      })

      // Dialog content must still be mounted — the inline handlers
      // called preventDefault() and Radix did not unmount the modal.
      expect(screen.getByText('Stays Title')).toBeInTheDocument()
      expect(
        document.querySelector('[data-slot="dialog-content"]')
      ).toBeInTheDocument()
    } finally {
      outsideNode.remove()
    }
  })
})
