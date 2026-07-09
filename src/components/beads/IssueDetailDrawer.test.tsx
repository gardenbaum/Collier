/**
 * Tests for the `IssueDetailDrawer` shell.
 *
 * The drawer is a thin wrapper that
 *   - mounts a backdrop + side panel (the chrome),
 *   - delegates the body to `<IssueDetailView>`,
 *   - wires the M5 dialog-a11y hook (focus trap + Escape + restoration).
 *
 * The body lives in `IssueDetailView` and has its own dedicated test
 * suite (81% line coverage as of the parent discovery card). Here we
 * only assert on the drawer's chrome: backdrop / panel click
 * semantics, close button, a11y wiring, and the prop passthrough to
 * `IssueDetailView`. Everything else is mocked out.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import { IssueDetailDrawer } from './IssueDetailDrawer'

// ponytail: hoist the mock fns so the vi.mock factories below can
// close over the same references the test body asserts on.
const { mockUseDialogA11y, mockIssueDetailView } = vi.hoisted(() => ({
  mockUseDialogA11y: vi.fn(),
  mockIssueDetailView: vi.fn(),
}))

vi.mock('./issues/IssueDetailView', () => ({
  // IssueDetailView's real implementation pulls in TanStack Query +
  // tauri-bindings. Mocking it lets the drawer's tests focus purely
  // on the chrome (backdrop / panel / close button / a11y wiring).
  // The mock renders a sentinel element whose data-testid lets each
  // test confirm the prop passthrough by reading its attributes.
  IssueDetailView: (props: {
    cwd: string
    issueId: string
    onClose: () => void
    onOpenIssue?: (id: string) => void
  }) => {
    mockIssueDetailView(props)
    return (
      <div
        data-testid="mock-issue-detail-view"
        data-cwd={props.cwd}
        data-issue-id={props.issueId}
        data-has-close="1"
        data-has-open-issue={props.onOpenIssue ? '1' : '0'}
      />
    )
  },
}))

vi.mock('@/hooks/useDialogA11y', () => ({
  useDialogA11y: (opts: unknown) => {
    mockUseDialogA11y(opts)
  },
}))

// react-i18next is NOT mocked here: the drawer's t() calls use the
// two-argument `t(key, defaultValue)` form, and react-i18next
// returns the defaultValue when the key is missing from the
// catalogue. The assertions in this file check for those exact
// default strings ("Close", "Issue details"), so the real module's
// behaviour is what we want to exercise — no mock required.

beforeEach(() => {
  mockUseDialogA11y.mockClear()
  mockIssueDetailView.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ponytail: render the drawer with the minimum required props. Each
// test mutates one prop / fires one event and asserts on the
// outcome. Keeping the harness tiny means a regression in the
// drawer's behaviour shows up as a localized failure rather than a
// cascade.

// onOpenIssue is intentionally NOT defaulted: callers that pass
// onOpenIssue: undefined are testing the optional-prop contract and
// need the drawer to receive undefined, not a fresh vi.fn(). The
// harness checks key-in-overrides to distinguish caller-didn't-pass-it
// (default to a fresh mock for ergonomics) from caller-explicitly-passed-undefined
// (prop must be omitted from the JSX).
function renderDrawer(
  overrides: Partial<{
    cwd: string
    issueId: string
    onClose: () => void
    onOpenIssue: ((id: string) => void) | undefined
  }> = {}
): {
  onClose: Mock<() => void>
  // The harness returns whichever value the caller passed (typed as
  // Mock for ergonomics), or undefined when the caller explicitly
  // opted out. Callers that pass a plain function get it back
  // untyped; callers that pass vi.fn() can still use .toHaveBeenCalled.
  onOpenIssue: Mock<(id: string) => void> | undefined
  user: ReturnType<typeof userEvent.setup>
} {
  const onClose = (overrides.onClose ?? vi.fn()) as Mock<() => void>
  const onOpenIssue =
    'onOpenIssue' in overrides
      ? (overrides.onOpenIssue as Mock<(id: string) => void> | undefined)
      : (vi.fn() as Mock<(id: string) => void>)
  const user = userEvent.setup()
  render(
    <IssueDetailDrawer
      cwd={overrides.cwd ?? '/repo/root'}
      issueId={overrides.issueId ?? 'beads-42'}
      onClose={onClose}
      {...(onOpenIssue === undefined ? {} : { onOpenIssue })}
    />
  )
  return { onClose, onOpenIssue, user }
}

describe('IssueDetailDrawer', () => {
  it('renders the drawer chrome with the expected testid', () => {
    renderDrawer()
    expect(screen.getByTestId('issue-detail-drawer')).toBeInTheDocument()
  })

  it('renders the close button with its expected testid and aria-label', () => {
    renderDrawer()
    const closeButton = screen.getByTestId('issue-detail-close')
    expect(closeButton).toBeInTheDocument()
    // lucide-react renders an <svg> for the X icon inside the button.
    expect(closeButton.querySelector('svg')).not.toBeNull()
    expect(closeButton).toHaveAttribute('aria-label', 'Close')
  })

  it('exposes the dialog a11y attributes (role + aria-modal + aria-label)', () => {
    renderDrawer()
    const panel = screen.getByRole('dialog')
    expect(panel).toHaveAttribute('aria-modal', 'true')
    expect(panel).toHaveAttribute('aria-label', 'Issue details')
  })

  it('renders the localized panel header inside the sticky bar', () => {
    renderDrawer()
    // The sticky header carries a second copy of the same label.
    expect(screen.getByText('Issue details')).toBeInTheDocument()
  })

  it('passes cwd, issueId, onClose and onOpenIssue through to IssueDetailView', () => {
    const { onClose, onOpenIssue } = renderDrawer({
      cwd: '/work/repo',
      issueId: 'beads-7',
    })

    const body = screen.getByTestId('mock-issue-detail-view')
    expect(body).toHaveAttribute('data-cwd', '/work/repo')
    expect(body).toHaveAttribute('data-issue-id', 'beads-7')
    expect(body).toHaveAttribute('data-has-close', '1')
    expect(body).toHaveAttribute('data-has-open-issue', '1')

    // The mock records the latest call so we can also assert on the
    // identity of the handlers — the drawer must forward the SAME
    // functions, not fresh ones.
    const lastCall = mockIssueDetailView.mock.calls.at(-1)?.[0]
    expect(lastCall?.cwd).toBe('/work/repo')
    expect(lastCall?.issueId).toBe('beads-7')
    expect(lastCall?.onClose).toBe(onClose)
    expect(lastCall?.onOpenIssue).toBe(onOpenIssue)
  })

  it('omits onOpenIssue from the IssueDetailView passthrough when not provided', () => {
    renderDrawer({ onOpenIssue: undefined })
    const body = screen.getByTestId('mock-issue-detail-view')
    expect(body).toHaveAttribute('data-has-open-issue', '0')
  })

  it('calls onClose when the backdrop is clicked', async () => {
    const { onClose, user } = renderDrawer()
    await user.click(screen.getByTestId('issue-detail-drawer'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does NOT call onClose when the panel itself is clicked (stopPropagation)', async () => {
    const { onClose, user } = renderDrawer()
    // The dialog panel is the role="dialog" element. Clicking inside
    // it must NOT bubble to the backdrop's onClick handler.
    const panel = screen.getByRole('dialog')
    await user.click(panel)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('calls onClose when the close button is clicked', async () => {
    const { onClose, user } = renderDrawer()
    await user.click(screen.getByTestId('issue-detail-close'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('wires useDialogA11y with the panel ref, close-button ref, and onClose', () => {
    const { onClose } = renderDrawer()
    expect(mockUseDialogA11y).toHaveBeenCalledTimes(1)
    const opts = mockUseDialogA11y.mock.calls[0]?.[0] as {
      panelRef: { current: HTMLElement | null }
      initialFocusRef: { current: HTMLElement | null }
      onClose: () => void
    }
    // The drawer mounts the panel via a `ref` callback on the
    // <div role="dialog">. After render, that ref must point at the
    // same dialog element testing-library just queried — proves the
    // hook receives a real DOM node, not the wrong ref.
    const panelInDom = screen.getByRole('dialog')
    expect(opts.panelRef.current).toBe(panelInDom)
    // Close button ref points at the close button.
    const closeButtonInDom = screen.getByTestId('issue-detail-close')
    expect(opts.initialFocusRef?.current).toBe(closeButtonInDom)
    // Escape / unmount restoration wires the SAME onClose identity.
    expect(opts.onClose).toBe(onClose)
  })
})
