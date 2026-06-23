/**
 * Tests for the IssueDetailView component.
 *
 * Contract: IssueDetailView mounts a right-side drawer with 4 tabs
 * (Description, Deps, Comments, History). It calls
 *   - `commands.bdShow(cwd, id)` on mount (shared header + Description tab)
 *   - `commands.bdComments(cwd, id)` when the Comments tab is opened
 *   - `commands.bdHistory(cwd, id)` when the History tab is opened
 *   - `commands.bdAddComment(cwd, id, body)` on form submit
 *
 * The Deps tab is a placeholder per the plan (T27-T33 in Wave 4) and
 * must NOT invoke any bd command. Closing the drawer calls the
 * onClose prop.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { render } from '@/test/test-utils'

// ponytail: hoisted so the vi.mock factory can reference the mock fn.
// `bdShow` is the only command that fires on mount; `bdComments` and
// `bdHistory` are gated by the active tab, and `bdAddComment` is only
// invoked by the form's submit handler.
const {
  mockBdShow,
  mockBdComments,
  mockBdHistory,
  mockBdAddComment,
  mockBdDepList,
} = vi.hoisted(() => ({
  mockBdShow: vi.fn(),
  mockBdComments: vi.fn(),
  mockBdHistory: vi.fn(),
  mockBdAddComment: vi.fn(),
  mockBdDepList: vi.fn(),
}))

vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    bdShow: mockBdShow,
    bdComments: mockBdComments,
    bdHistory: mockBdHistory,
    bdAddComment: mockBdAddComment,
    bdDepList: mockBdDepList,
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

const importSut = () => import('./IssueDetailView')

// ponytail: single shared noop for the onClose prop across tests —
// satisfies `@typescript-eslint/no-empty-function` (the `() => {}`
// form is rejected, `() => undefined` is fine). The close-button test
// uses a dedicated `vi.fn()` so it can assert call counts.
const noop = () => undefined

const issueFixture = {
  id: 'beads-42',
  title: 'Fix the thing',
  status: 'open' as const,
  priority: 'P1' as const,
  issue_type: 'bug' as const,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: null,
  closed_at: null,
  description: 'The widget is on fire. Please put it out.',
  owner: 'alice',
  labels: [{ name: 'urgent', color: null }],
  dependencies: [],
  dependency_count: 0,
  dependent_count: 0,
  comment_count: 2,
  parent: null,
  acceptance_criteria: null,
  external_ref: null,
}

const commentsFixture = [
  {
    id: 'c-1',
    author: 'alice',
    body: 'Looking into this now.',
    created_at: '2026-01-02T00:00:00Z',
    updated_at: null,
  },
  {
    id: 'c-2',
    author: 'bob',
    body: 'Confirmed on staging.',
    created_at: '2026-01-03T00:00:00Z',
    updated_at: null,
  },
]

const historyFixture = [
  {
    id: 'commit-1',
    issueId: 'beads-42',
    timestamp: '2026-01-01T00:00:00Z',
    action: 'status: open',
    actor: 'alice',
    details: 'Fix the thing',
  },
  {
    id: 'commit-2',
    issueId: 'beads-42',
    timestamp: '2026-01-02T00:00:00Z',
    action: 'priority: P1',
    actor: 'bob',
    details: 'Fix the thing (P1)',
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockBdShow.mockResolvedValue({ status: 'ok', data: issueFixture })
  mockBdComments.mockResolvedValue({ status: 'ok', data: commentsFixture })
  mockBdHistory.mockResolvedValue({ status: 'ok', data: historyFixture })
  mockBdDepList.mockResolvedValue({ status: 'ok', data: [] })
})

describe('IssueDetailView', () => {
  it('renders the title, badges, and id from the bdShow response', async () => {
    const { IssueDetailView } = await importSut()
    render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

    // Title appears in the header (h1). `findByRole` waits for the
    // bdShow promise to resolve and the header to render.
    expect(
      await screen.findByRole('heading', { name: 'Fix the thing' })
    ).toBeInTheDocument()

    // Id is in the header top row.
    expect(screen.getByText('beads-42')).toBeInTheDocument()

    // Badges are present in the header.
    expect(screen.getByTestId('priority-dot')).toBeInTheDocument()
    expect(screen.getByTestId('type-icon')).toBeInTheDocument()
    expect(screen.getByTestId('status-pill')).toBeInTheDocument()
    expect(screen.getByTestId('label-chip')).toBeInTheDocument()

    // bdShow was called with the cwd + id.
    expect(mockBdShow).toHaveBeenCalledWith('/repo', 'beads-42')

    // Comments / history are NOT fetched on mount (gated by activeTab).
    expect(mockBdComments).not.toHaveBeenCalled()
    expect(mockBdHistory).not.toHaveBeenCalled()
  })

  it('clicking the Description tab shows the description body', async () => {
    const { IssueDetailView } = await importSut()
    render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

    await waitFor(() => {
      expect(screen.getByTestId('description-body')).toBeInTheDocument()
    })

    // The description text is in the body.
    expect(screen.getByTestId('description-body').textContent).toContain(
      'The widget is on fire. Please put it out.'
    )
  })

  it('clicking the Deps tab mounts the DependencyListView', async () => {
    const { IssueDetailView } = await importSut()
    render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

    fireEvent.click(screen.getByTestId('tab-deps'))

    // The Deps tab now mounts the real DependencyListView (the
    // v1.0 "Wave 4" placeholder was replaced in T45-T46). The
    // component fires `bd_dep_list` immediately on mount; we assert
    // on the rendered loading state since the test mocks never
    // resolve.
    await waitFor(() => {
      expect(screen.getByTestId('deps-tab')).toBeInTheDocument()
    })
    // Comments + history are NOT fetched for the Deps tab.
    expect(mockBdComments).not.toHaveBeenCalled()
    expect(mockBdHistory).not.toHaveBeenCalled()
  })

  it('clicking the Comments tab loads comments and renders them', async () => {
    const { IssueDetailView } = await importSut()
    render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

    fireEvent.click(screen.getByTestId('tab-comments'))

    await waitFor(() => {
      expect(mockBdComments).toHaveBeenCalledWith('/repo', 'beads-42')
    })
    await waitFor(() => {
      expect(screen.getAllByTestId('comment-row')).toHaveLength(2)
    })

    const rows = screen.getAllByTestId('comment-row')
    expect(rows[0]?.getAttribute('data-comment-id')).toBe('c-1')
    expect(rows[0]?.textContent).toContain('alice')
    expect(rows[0]?.textContent).toContain('Looking into this now.')
    expect(rows[1]?.getAttribute('data-comment-id')).toBe('c-2')
    expect(rows[1]?.textContent).toContain('bob')
    expect(rows[1]?.textContent).toContain('Confirmed on staging.')
  })

  it('submitting a new comment fires bdAddComment and clears the form', async () => {
    const { IssueDetailView } = await importSut()
    render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

    fireEvent.click(screen.getByTestId('tab-comments'))

    await waitFor(() => {
      expect(screen.getAllByTestId('comment-row')).toHaveLength(2)
    })

    const textarea = screen.getByTestId('comment-input') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'A new comment' } })
    expect(textarea.value).toBe('A new comment')

    fireEvent.click(screen.getByTestId('comment-submit-button'))

    await waitFor(() => {
      expect(mockBdAddComment).toHaveBeenCalledWith(
        '/repo',
        'beads-42',
        'A new comment'
      )
    })

    // The textarea is cleared after a successful submit.
    await waitFor(() => {
      expect(
        (screen.getByTestId('comment-input') as HTMLTextAreaElement).value
      ).toBe('')
    })
  })

  it('clicking the History tab renders history entries', async () => {
    const { IssueDetailView } = await importSut()
    render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

    fireEvent.click(screen.getByTestId('tab-history'))

    await waitFor(() => {
      expect(mockBdHistory).toHaveBeenCalledWith('/repo', 'beads-42')
    })
    await waitFor(() => {
      expect(screen.getAllByTestId('history-row')).toHaveLength(2)
    })

    const rows = screen.getAllByTestId('history-row')
    expect(rows[0]?.getAttribute('data-history-id')).toBe('commit-1')
    expect(rows[0]?.textContent).toContain('status: open')
    expect(rows[0]?.textContent).toContain('alice')
    expect(rows[1]?.getAttribute('data-history-id')).toBe('commit-2')
    expect(rows[1]?.textContent).toContain('priority: P1')
    expect(rows[1]?.textContent).toContain('bob')
  })

  it('clicking the close button fires the onClose callback', async () => {
    const { IssueDetailView } = await importSut()
    const onClose = vi.fn()
    render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={onClose} />)

    fireEvent.click(screen.getByTestId('close-button'))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not use the brand colour anywhere in the rendered output', async () => {
    const { IssueDetailView } = await importSut()
    const { container } = render(
      <IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />
    )

    await waitFor(() => {
      expect(screen.getByTestId('issue-detail-view')).toBeInTheDocument()
    })

    // ponytail: AC-14 — the brand colour is reserved for destructive
    // actions and P0 only. The header, tabs, and Description body must
    // not surface the accent (the P0 priority dot is fine because it
    // uses the badge's internal stylesheet, but the spec only checks
    // the brand hex value in the rendered HTML, and P1 here means no
    // accent in this fixture at all).
    const html = container.innerHTML.toLowerCase()
    expect(html).not.toContain('c2410c')
  })
})
