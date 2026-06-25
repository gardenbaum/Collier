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
// invoked by the form's submit handler. `bdUpdate` is the R4
// description-edit command — also invoked from the description tab.
const {
  mockBdShow,
  mockBdComments,
  mockBdHistory,
  mockBdAddComment,
  mockBdDepList,
  mockBdUpdate,
} = vi.hoisted(() => ({
  mockBdShow: vi.fn(),
  mockBdComments: vi.fn(),
  mockBdHistory: vi.fn(),
  mockBdAddComment: vi.fn(),
  mockBdDepList: vi.fn(),
  mockBdUpdate: vi.fn(),
}))

vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    bdShow: mockBdShow,
    bdComments: mockBdComments,
    bdHistory: mockBdHistory,
    bdAddComment: mockBdAddComment,
    bdDepList: mockBdDepList,
    bdUpdate: mockBdUpdate,
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

// ponytail: sonner renders toasts into a portal — the test env
// doesn't mount <Toaster />, so toast text never lands in the DOM.
// Mock the toast API for InlineDescriptionEdit's success/error toasts
// (same pattern as InlineIssueEdit.test.tsx).
vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
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

  // M6 R8 — comments must render chronologically (oldest at the
  // top, newest at the bottom) regardless of the order the bd
  // command returned them in. The previous implementation trusted
  // bd's wire order, which can change between Dolt / JSONL /
  // index paths. The new sort uses `String#localeCompare` on the
  // ISO 8601 `created_at` field — lexicographic order on ISO
  // 8601 strings is the same as chronological order, so the sort
  // is allocation-free.
  describe('comments sort (M6 R8)', () => {
    it('sorts comments ascending by created_at when bd returns them out of order', async () => {
      // Wire order is newest-first; the UI must reorder to
      // oldest-first regardless.
      mockBdComments.mockResolvedValue({
        status: 'ok',
        data: [
          {
            ...commentsFixture[1],
            id: 'c-2',
            created_at: '2026-01-03T00:00:00Z',
          },
          {
            ...commentsFixture[0],
            id: 'c-1',
            created_at: '2026-01-02T00:00:00Z',
          },
        ],
      })
      const { IssueDetailView } = await importSut()
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      fireEvent.click(screen.getByTestId('tab-comments'))

      await waitFor(() => {
        expect(screen.getAllByTestId('comment-row')).toHaveLength(2)
      })

      const rows = screen.getAllByTestId('comment-row')
      // c-1 (older) renders first, c-2 (newer) renders second —
      // not the wire order.
      expect(rows[0]?.getAttribute('data-comment-id')).toBe('c-1')
      expect(rows[1]?.getAttribute('data-comment-id')).toBe('c-2')
    })

    it('sorts three or more comments by created_at', async () => {
      mockBdComments.mockResolvedValue({
        status: 'ok',
        data: [
          {
            id: 'c-mid',
            author: 'carol',
            body: 'middle',
            created_at: '2026-02-15T12:00:00Z',
            updated_at: null,
          },
          {
            id: 'c-newest',
            author: 'dave',
            body: 'newest',
            created_at: '2026-03-01T00:00:00Z',
            updated_at: null,
          },
          {
            id: 'c-oldest',
            author: 'eve',
            body: 'oldest',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: null,
          },
        ],
      })
      const { IssueDetailView } = await importSut()
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      fireEvent.click(screen.getByTestId('tab-comments'))

      await waitFor(() => {
        expect(screen.getAllByTestId('comment-row')).toHaveLength(3)
      })

      const rows = screen.getAllByTestId('comment-row')
      expect(rows[0]?.getAttribute('data-comment-id')).toBe('c-oldest')
      expect(rows[1]?.getAttribute('data-comment-id')).toBe('c-mid')
      expect(rows[2]?.getAttribute('data-comment-id')).toBe('c-newest')
    })

    it('does not mutate the underlying query data array', async () => {
      const wireData = [
        {
          ...commentsFixture[1],
          id: 'c-2',
          created_at: '2026-01-03T00:00:00Z',
        },
        {
          ...commentsFixture[0],
          id: 'c-1',
          created_at: '2026-01-02T00:00:00Z',
        },
      ]
      const wireCopy = JSON.parse(JSON.stringify(wireData))
      mockBdComments.mockResolvedValue({ status: 'ok', data: wireData })
      const { IssueDetailView } = await importSut()
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      fireEvent.click(screen.getByTestId('tab-comments'))

      await waitFor(() => {
        expect(screen.getAllByTestId('comment-row')).toHaveLength(2)
      })

      // ponytail: sorting must be a non-mutating copy. The TanStack
      // Query cache holds the wire-order array; in-place sort would
      // re-order it for every consumer of the same cache entry.
      // The implementation spreads `[...query.data]` before sort
      // — this test guards against future "optimisations" that
      // reach for `query.data.sort()` directly.
      expect(wireData).toEqual(wireCopy)
    })
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

  // ponytail: R4 — description is editable from the detail view via
  // InlineDescriptionEdit, which fires commands.bdUpdate with a
  // minimal-diff UpdateInput. The header metadata (priority, type,
  // status, assignee, dates, labels) is rendered by the existing
  // header above the description tab, and the metadata <dl> is
  // rendered inside the description-body wrapper. This block
  // verifies the integration.
  describe('description edit (R4)', () => {
    it('exposes an Edit button next to the description text', async () => {
      const { IssueDetailView } = await importSut()
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      await waitFor(() => {
        expect(screen.getByTestId('description-body')).toBeInTheDocument()
      })
      // ponytail: InlineDescriptionEdit renders the Edit affordance
      // next to the description text. Its presence proves the
      // editing surface is wired into the detail view.
      expect(
        screen.getByTestId('inline-description-edit-button')
      ).toBeInTheDocument()
    })

    it('renders the metadata <dl> with type / priority / status / dates', async () => {
      const { IssueDetailView } = await importSut()
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      await waitFor(() => {
        expect(screen.getByTestId('description-body')).toBeInTheDocument()
      })

      // ponytail: R4 acceptance — metadata is rendered. We assert
      // on the field labels (Type, Priority, Status, Created) since
      // the values come from the Issue shape and the existing
      // Inline*Edit cells cover the badge rendering.
      const body = screen.getByTestId('description-body').textContent ?? ''
      expect(body).toContain('Type')
      expect(body).toContain('Priority')
      expect(body).toContain('Status')
      expect(body).toContain('Created')
      // Owner + Updated / Closed are conditional; the fixture has
      // owner=alice and updated_at=null so Owner must render.
      expect(body).toContain('Owner')
    })

    it('clicking Edit, typing, and Save fires bdUpdate with the new description', async () => {
      mockBdUpdate.mockResolvedValue({
        status: 'ok',
        data: {
          ...issueFixture,
          description: 'A clearer description for the widget.',
        },
      })
      const { IssueDetailView } = await importSut()
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      await waitFor(() => {
        expect(screen.getByTestId('description-body')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('inline-description-edit-button'))

      const textarea = screen.getByTestId(
        'inline-description-textarea'
      ) as HTMLTextAreaElement
      fireEvent.change(textarea, {
        target: { value: 'A clearer description for the widget.' },
      })
      fireEvent.click(screen.getByTestId('inline-description-save'))

      await waitFor(() => {
        expect(mockBdUpdate).toHaveBeenCalledWith('/repo', 'beads-42', {
          description: 'A clearer description for the widget.',
        })
      })
    })

    it('clicking Cancel does not fire bdUpdate and dismisses the form', async () => {
      const { IssueDetailView } = await importSut()
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      await waitFor(() => {
        expect(screen.getByTestId('description-body')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('inline-description-edit-button'))
      fireEvent.change(screen.getByTestId('inline-description-textarea'), {
        target: { value: 'wont be saved' },
      })
      fireEvent.click(screen.getByTestId('inline-description-cancel'))

      expect(mockBdUpdate).not.toHaveBeenCalled()
      expect(
        screen.queryByTestId('inline-description-edit-form')
      ).not.toBeInTheDocument()
    })
  })

  // ponytail: R4 — the Deps tab must render dependencies as
  // navigable links. DependencyListView calls onOpenIssue on click;
  // IssueDetailView forwards the prop or falls back to a no-op.
  describe('dependencies (R4)', () => {
    it('clicking a dep target id in the Deps tab fires onOpenIssue', async () => {
      const { IssueDetailView } = await importSut()
      mockBdDepList.mockResolvedValue({
        status: 'ok',
        data: [
          {
            id: 'dep-1',
            from_id: 'beads-42',
            from_issue_id: 'beads-42',
            dependency_id: 'beads-99',
            dependency_type: 'blocks',
            created_at: '2026-06-17T00:00:00Z',
          },
        ],
      })
      const onOpenIssue = vi.fn()
      render(
        <IssueDetailView
          cwd="/repo"
          issueId="beads-42"
          onClose={noop}
          onOpenIssue={onOpenIssue}
        />
      )

      fireEvent.click(screen.getByTestId('tab-deps'))
      await waitFor(() => {
        expect(screen.getByTestId('deps-section-blocks')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('dep-target-id'))
      expect(onOpenIssue).toHaveBeenCalledWith('beads-99')
    })
  })

  // M3 R8 — the detail header surfaces a "blocked by N" / "blocks N"
  // chip next to the inline-edit badges. Driven by the same counts
  // the row-level badge uses (dependency_count / dependent_count on
  // the `Issue` returned by `bd show --json`).
  describe('dep badge (M3 R8)', () => {
    it('renders the header-variant dep badge for a blocked issue', async () => {
      const { IssueDetailView } = await importSut()
      const blockedIssue = {
        ...issueFixture,
        id: 'beads-99',
        status: 'blocked' as const,
        dependency_count: 2,
        dependent_count: 1,
      }
      mockBdShow.mockResolvedValue({ status: 'ok', data: blockedIssue })

      render(<IssueDetailView cwd="/repo" issueId="beads-99" onClose={noop} />)

      // ponytail: the badge is inside the `issue ? ... : null`
      // branch, so it only mounts once `bdShow` resolves. Wait
      // for the badge directly rather than the outer container
      // (which renders in the loading state).
      const badge = await waitFor(() => screen.getByTestId('dep-badge'))
      expect(badge.getAttribute('data-variant')).toBe('header')
      expect(badge.getAttribute('data-blocked-by')).toBe('2')
      expect(badge.getAttribute('data-blocks')).toBe('1')
      expect(badge.textContent).toContain('blocked by 2')
      expect(badge.textContent).toContain('blocks 1')
    })

    it('omits the dep badge when both counts are zero', async () => {
      const { IssueDetailView } = await importSut()
      mockBdShow.mockResolvedValue({ status: 'ok', data: issueFixture })

      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      // Wait for the issue to load (title renders) before asserting
      // the badge is absent.
      await waitFor(() => {
        expect(screen.getByText('Fix the thing')).toBeInTheDocument()
      })

      expect(screen.queryByTestId('dep-badge')).toBeNull()
    })
  })
})
