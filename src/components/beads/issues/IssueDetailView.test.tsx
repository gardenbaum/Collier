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

  // ponytail: M6 R9 — the top-level render path branches on the
  // shared `showQuery` state. Three branches were uncovered:
  //   - `showQuery.isLoading` → header shows "Loading…" instead of
  //     the title block.
  //   - `showQuery.isError` → header shows the humanised error
  //     string from `formatBdError` instead of the title block.
  //   - `issue` falsy after the query resolved → header renders the
  //     trailing `: null` branch.
  // The same branches are mirrored inside `DescriptionTab` with
  // distinct data-testid markers; both surfaces are asserted.
  describe('top-level render branches', () => {
    it('shows "Loading…" in the header while bdShow is pending', async () => {
      // Promise that never resolves → query stays in `isLoading`
      // forever.
      mockBdShow.mockReturnValue(new Promise<never>(() => undefined))

      const { IssueDetailView } = await importSut()
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      // The "Loading…" text is emitted in BOTH the header and
      // DescriptionTab while the query is pending — getAllByText
      // asserts both surfaces are wired without false negatives
      // on a single match.
      await waitFor(() => {
        expect(screen.getAllByText('Loading…')).toHaveLength(2)
      })
      // The header's loading state is also marked by the
      // absence of the title block — title text must NOT be
      // rendered yet (bdShow never resolved).
      expect(screen.queryByText('Fix the thing')).toBeNull()
    })

    it('shows "Failed to load issue: …" in the header when bdShow errors', async () => {
      mockBdShow.mockResolvedValue({
        status: 'error',
        error: { type: 'NotFound', id: 'beads-42' },
      })

      const { IssueDetailView } = await importSut()
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      // `formatBdError` is private; we assert on its formatted
      // output (`NotFound (id=beads-42)`) which is the only stable
      // public surface of the helper in this context.
      await waitFor(() => {
        expect(
          screen.getByText(/Failed to load issue: NotFound/i)
        ).toBeInTheDocument()
      })
      expect(screen.queryByText('Fix the thing')).toBeNull()
    })

    it('renders nothing in the title slot when the issue resolves to a falsy value', async () => {
      // Defensive: bdShow returning `{ data: null }` should not
      // throw — the `: null` fallback branch renders no title.
      mockBdShow.mockResolvedValue({ status: 'ok', data: null })

      const { IssueDetailView } = await importSut()
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      // Wait for the query to settle: DescriptionTab's `!issue`
      // branch renders the `description-empty` element. Only
      // after that point is it safe to assert the header's title
      // slot is empty (loading is gone).
      await waitFor(() => {
        expect(screen.getByTestId('description-empty')).toBeInTheDocument()
      })
      expect(screen.queryByText('Fix the thing')).toBeNull()
      expect(screen.queryByText(/Failed to load issue/)).toBeNull()
    })
  })

  // ponytail: DescriptionTab branches on the same `showQuery` state.
  // Each state has its own data-testid so the r3/r4 e2e specs can
  // distinguish them. We exercise all three here so the title-block
  // branch above and the description-body branch below stay in sync.
  describe('DescriptionTab render branches', () => {
    it('renders the description-loading element while bdShow is pending', async () => {
      mockBdShow.mockReturnValue(new Promise<never>(() => undefined))

      const { IssueDetailView } = await importSut()
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      await waitFor(() => {
        expect(screen.getByTestId('description-loading')).toBeInTheDocument()
      })
      expect(screen.queryByTestId('description-body')).toBeNull()
    })

    it('renders the description-error element when bdShow rejects', async () => {
      mockBdShow.mockResolvedValue({
        status: 'error',
        error: { type: 'IoError', message: 'disk on fire' },
      })

      const { IssueDetailView } = await importSut()
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      await waitFor(() => {
        expect(screen.getByTestId('description-error')).toBeInTheDocument()
      })
      // ponytail: DescriptionTab formats errors with `String(err)`,
      // not `formatBdError`. The raw `[object Object]` literal is
      // the documented contract — assert on it.
      expect(screen.getByTestId('description-error').textContent).toContain(
        '[object Object]'
      )
    })

    it('renders the description-empty element when bdShow returns no data', async () => {
      mockBdShow.mockResolvedValue({ status: 'ok', data: null })

      const { IssueDetailView } = await importSut()
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      await waitFor(() => {
        expect(screen.getByTestId('description-empty')).toBeInTheDocument()
      })
      expect(screen.queryByTestId('description-body')).toBeNull()
    })
  })

  // ponytail: the header's "updated:" / "closed:" / labels row are
  // all `? ... : null` ternaries. The fixture has `updated_at: null`
  // and `closed_at: null` and a single label, so the negative
  // branches (no updated row, no closed row) are exercised by the
  // default test. We add the positive branches here.
  describe('header meta branches (M6 R9)', () => {
    it('renders the "updated:" span when updated_at is set', async () => {
      mockBdShow.mockResolvedValue({
        status: 'ok',
        data: {
          ...issueFixture,
          updated_at: '2026-02-15T12:00:00Z',
        },
      })

      const { IssueDetailView } = await importSut()
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      await waitFor(() => {
        expect(screen.getByText(/^updated:/)).toBeInTheDocument()
      })
    })

    it('renders the "closed:" span when closed_at is set', async () => {
      mockBdShow.mockResolvedValue({
        status: 'ok',
        data: {
          ...issueFixture,
          status: 'closed' as const,
          closed_at: '2026-03-01T00:00:00Z',
        },
      })

      const { IssueDetailView } = await importSut()
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      await waitFor(() => {
        expect(screen.getByText(/^closed:/)).toBeInTheDocument()
      })
    })

    it('omits the labels row when the issue has no labels', async () => {
      mockBdShow.mockResolvedValue({
        status: 'ok',
        data: { ...issueFixture, labels: [] },
      })

      const { IssueDetailView } = await importSut()
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      await waitFor(() => {
        expect(screen.getByText('Fix the thing')).toBeInTheDocument()
      })
      expect(screen.queryByTestId('label-chip')).toBeNull()
    })

    it('falls back to 0 for dependency_count when bd omits the field', async () => {
      // Drop dependency_count entirely (bd v1.0.4's `bd show` omits
      // it; the `?? 0` fallback keeps the badge callable). The
      // `dependent_count` stays at 1 so the badge actually renders
      // — DependencyBadge returns null when both counts are 0, and
      // only emits the `data-blocked-by` attribute when
      // `blockedBy > 0`. So with `dependent_count=1` we get only
      // the `data-blocks="1"` half; the absence of
      // `data-blocked-by` IS the assertion that `?? 0` ran.
      mockBdShow.mockResolvedValue({
        status: 'ok',
        data: {
          ...issueFixture,
          dependency_count: undefined,
          dependent_count: 1,
        },
      })

      const { IssueDetailView } = await importSut()
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      const badge = await waitFor(() => screen.getByTestId('dep-badge'))
      // Only the "blocks" half is rendered — the missing
      // "blocked-by" half is the observable proof the `?? 0`
      // fallback fired (the prop arrived as undefined, then `0`,
      // and the badge omitted the chip for 0).
      expect(badge.getAttribute('data-blocked-by')).toBeNull()
      expect(badge.getAttribute('data-blocks')).toBe('1')
      expect(badge.textContent).toContain('blocks 1')
    })

    it('falls back to 0 for dependent_count when bd omits the field', async () => {
      // Mirror of the above — `dependency_count` is set, the
      // `dependent_count` field is missing.
      mockBdShow.mockResolvedValue({
        status: 'ok',
        data: {
          ...issueFixture,
          dependency_count: 2,
          dependent_count: undefined,
        },
      })

      const { IssueDetailView } = await importSut()
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      const badge = await waitFor(() => screen.getByTestId('dep-badge'))
      expect(badge.getAttribute('data-blocked-by')).toBe('2')
      // `?? 0` fired → blockedBy=0 → hasIncoming false →
      // `data-blocks` attribute is NOT emitted.
      expect(badge.getAttribute('data-blocks')).toBeNull()
      expect(badge.textContent).toContain('blocked by 2')
    })
  })

  // ponytail: DescriptionTab's `<dl>` shows four meta rows
  // (Owner / Updated / Closed / External ref) that are gated on
  // nullable Issue fields. The fixture sets `owner: 'alice'` and
  // the rest to null, so the default test already covers the Owner
  // positive + the rest negative. Add the three missing positives.
  describe('DescriptionTab meta branches (M6 R9)', () => {
    it('omits the Owner row when owner is null', async () => {
      mockBdShow.mockResolvedValue({
        status: 'ok',
        data: { ...issueFixture, owner: null },
      })

      const { IssueDetailView } = await importSut()
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      await waitFor(() => {
        expect(screen.getByTestId('description-body')).toBeInTheDocument()
      })
      const body = screen.getByTestId('description-body').textContent ?? ''
      expect(body).not.toContain('Owner')
    })

    it('renders the Updated row when updated_at is set', async () => {
      mockBdShow.mockResolvedValue({
        status: 'ok',
        data: { ...issueFixture, updated_at: '2026-02-15T12:00:00Z' },
      })

      const { IssueDetailView } = await importSut()
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      await waitFor(() => {
        expect(screen.getByTestId('description-body')).toBeInTheDocument()
      })
      // The dl uses dt/dd; the "Updated" label is unique enough to
      // assert without relying on position.
      expect(screen.getByTestId('description-body').textContent).toContain(
        'Updated'
      )
    })

    it('renders the Closed row when closed_at is set', async () => {
      mockBdShow.mockResolvedValue({
        status: 'ok',
        data: {
          ...issueFixture,
          status: 'closed' as const,
          closed_at: '2026-03-01T00:00:00Z',
        },
      })

      const { IssueDetailView } = await importSut()
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      await waitFor(() => {
        expect(screen.getByTestId('description-body')).toBeInTheDocument()
      })
      expect(screen.getByTestId('description-body').textContent).toContain(
        'Closed'
      )
    })

    it('renders the External ref row when external_ref is set', async () => {
      mockBdShow.mockResolvedValue({
        status: 'ok',
        data: { ...issueFixture, external_ref: 'https://example.com/42' },
      })

      const { IssueDetailView } = await importSut()
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      await waitFor(() => {
        expect(screen.getByTestId('description-body')).toBeInTheDocument()
      })
      const body = screen.getByTestId('description-body')
      expect(body.textContent).toContain('External ref')
      expect(body.textContent).toContain('https://example.com/42')
    })
  })

  // ponytail: CommentsTab has 6 branches that v8 reports as
  // uncovered: query.isLoading, query.isError, comments.length === 0,
  // mutation.isError (renders the alert via `formatError`),
  // mutation.isPending (button label + style), and the
  // whitespace-only submit guard inside `handleSubmit`.
  describe('CommentsTab branches', () => {
    it('renders the comments-loading element while bdComments is pending', async () => {
      mockBdComments.mockReturnValue(new Promise<never>(() => undefined))

      const { IssueDetailView } = await importSut()
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      fireEvent.click(screen.getByTestId('tab-comments'))

      await waitFor(() => {
        expect(screen.getByTestId('comments-loading')).toBeInTheDocument()
      })
      expect(screen.queryByTestId('comments-tab')).toBeNull()
    })

    it('renders the comments-error element when bdComments rejects', async () => {
      mockBdComments.mockResolvedValue({
        status: 'error',
        error: { type: 'IoError', message: 'comments read failed' },
      })

      const { IssueDetailView } = await importSut()
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      fireEvent.click(screen.getByTestId('tab-comments'))

      await waitFor(() => {
        expect(screen.getByTestId('comments-error')).toBeInTheDocument()
      })
      // Same `String(err)` fallback as DescriptionTab's error path.
      expect(screen.getByTestId('comments-error').textContent).toContain(
        '[object Object]'
      )
    })

    it('renders the comments-empty element when there are no comments', async () => {
      mockBdComments.mockResolvedValue({ status: 'ok', data: [] })

      const { IssueDetailView } = await importSut()
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      fireEvent.click(screen.getByTestId('tab-comments'))

      await waitFor(() => {
        expect(screen.getByTestId('comments-empty')).toBeInTheDocument()
      })
      expect(screen.queryAllByTestId('comment-row')).toHaveLength(0)
    })

    it('renders the comment-mutation-error element when bdAddComment fails', async () => {
      mockBdAddComment.mockResolvedValue({
        status: 'error',
        error: { type: 'NonZeroExit', stderr: 'bd failed: nope' },
      })

      const { IssueDetailView } = await importSut()
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      fireEvent.click(screen.getByTestId('tab-comments'))
      await waitFor(() => {
        expect(screen.getByTestId('comments-tab')).toBeInTheDocument()
      })

      fireEvent.change(screen.getByTestId('comment-input'), {
        target: { value: 'will fail' },
      })
      fireEvent.click(screen.getByTestId('comment-submit-button'))

      await waitFor(() => {
        expect(screen.getByTestId('comment-mutation-error')).toBeInTheDocument()
      })
      // `formatError` collapses NonZeroExit → `bd failed: <stderr>`.
      expect(
        screen.getByTestId('comment-mutation-error').textContent
      ).toContain('bd failed: nope')
    })

    it('shows "Posting…" and disables the submit button while the mutation is pending', async () => {
      // Hold the mutation pending forever — exercises the
      // `mutation.isPending` branch in the button label + the
      // `disabled` style branch + the `mutation.isPending` guard
      // inside `handleSubmit` (clicking again should NOT trigger a
      // second mutate call).
      mockBdAddComment.mockReturnValue(new Promise<never>(() => undefined))

      const { IssueDetailView } = await importSut()
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      fireEvent.click(screen.getByTestId('tab-comments'))
      await waitFor(() => {
        expect(screen.getByTestId('comments-tab')).toBeInTheDocument()
      })

      const textarea = screen.getByTestId(
        'comment-input'
      ) as HTMLTextAreaElement
      fireEvent.change(textarea, { target: { value: 'pending forever' } })
      const button = screen.getByTestId('comment-submit-button')
      fireEvent.click(button)

      await waitFor(() => {
        expect(screen.getByText('Posting…')).toBeInTheDocument()
      })
      // Textarea disabled + submit button disabled.
      expect(
        screen.getByTestId('comment-input') as HTMLTextAreaElement
      ).toBeDisabled()
      expect(button).toBeDisabled()
      // First mutate fired. A second click while pending must NOT
      // fire another — the `if (mutation.isPending) return` guard.
      fireEvent.click(button)
      expect(mockBdAddComment).toHaveBeenCalledTimes(1)
    })

    it('ignores submit when the draft is whitespace-only', async () => {
      const { IssueDetailView } = await importSut()
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      fireEvent.click(screen.getByTestId('tab-comments'))
      await waitFor(() => {
        expect(screen.getByTestId('comments-tab')).toBeInTheDocument()
      })

      // ponytail: the submit button is `disabled` whenever
      // `draft.trim().length === 0` (including whitespace-only
      // drafts), so a direct click on it is a no-op — the form
      // never submits. To exercise the `trimmed.length === 0`
      // guard inside `handleSubmit` we have to dispatch the
      // submit event on the form element itself, bypassing the
      // browser's disabled-button check. Asserting on the
      // mutation mock is the proof: if the guard worked the
      // mutation never fires.
      fireEvent.change(screen.getByTestId('comment-input'), {
        target: { value: '   \n  \t  ' },
      })
      const formEl = screen.getByTestId('comments-tab').querySelector('form')
      if (!formEl) throw new Error('expected form element')
      fireEvent.submit(formEl)

      // The whitespace guard (`trimmed.length === 0`) keeps
      // bdAddComment from firing.
      expect(mockBdAddComment).not.toHaveBeenCalled()
    })

    it('keeps the submit button enabled when the draft is non-whitespace', async () => {
      const { IssueDetailView } = await importSut()
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      fireEvent.click(screen.getByTestId('tab-comments'))
      await waitFor(() => {
        expect(screen.getByTestId('comments-tab')).toBeInTheDocument()
      })

      fireEvent.change(screen.getByTestId('comment-input'), {
        target: { value: 'something real' },
      })
      expect(screen.getByTestId('comment-submit-button')).not.toBeDisabled()
    })

    it('invalidates the comments cache and refetches on successful submit', async () => {
      // ponytail: the `onSuccess` callback of `addCommentMutation`
      // fires `queryClient.invalidateQueries` (to mark the cache
      // stale) and then `commentsQuery.refetch()` (to pull the
      // fresh list immediately while the user is still staring
      // at the Comments tab). To hit the `onSuccess` branch the
      // mock must resolve — the default test mock returns
      // undefined which throws inside `mutationFn`, so
      // `onSuccess` never fires. Drive bdAddComment with a real
      // `status: 'ok'` result and assert the comment list
      // re-fetches.
      mockBdAddComment.mockResolvedValue({ status: 'ok', data: null })

      const { IssueDetailView } = await importSut()
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      fireEvent.click(screen.getByTestId('tab-comments'))
      await waitFor(() => {
        expect(screen.getAllByTestId('comment-row')).toHaveLength(2)
      })

      // Initial fetch happens once when the Comments tab opens.
      const initialCallCount = mockBdComments.mock.calls.length

      fireEvent.change(screen.getByTestId('comment-input'), {
        target: { value: 'new comment for cache test' },
      })
      fireEvent.click(screen.getByTestId('comment-submit-button'))

      // `onSuccess` → `commentsQuery.refetch()` triggers a second
      // bdComments call.
      await waitFor(() => {
        expect(mockBdComments.mock.calls.length).toBeGreaterThan(
          initialCallCount
        )
      })
    })
  })

  // ponytail: HistoryTab branches on the `historyQuery` state plus
  // two row-level branches (`e.actor`, `e.details`). The fixture
  // provides both fields on every row, so the default test exercises
  // only the populated path. Here we hit isLoading / isError /
  // empty + the two missing fields.
  describe('HistoryTab branches', () => {
    it('renders the history-loading element while bdHistory is pending', async () => {
      mockBdHistory.mockReturnValue(new Promise<never>(() => undefined))

      const { IssueDetailView } = await importSut()
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      fireEvent.click(screen.getByTestId('tab-history'))

      await waitFor(() => {
        expect(screen.getByTestId('history-loading')).toBeInTheDocument()
      })
      expect(screen.queryByTestId('history-list')).toBeNull()
    })

    it('renders the history-error element when bdHistory rejects', async () => {
      mockBdHistory.mockResolvedValue({
        status: 'error',
        error: { type: 'IoError', message: 'history read failed' },
      })

      const { IssueDetailView } = await importSut()
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      fireEvent.click(screen.getByTestId('tab-history'))

      await waitFor(() => {
        expect(screen.getByTestId('history-error')).toBeInTheDocument()
      })
      expect(screen.getByTestId('history-error').textContent).toContain(
        '[object Object]'
      )
    })

    it('renders the history-empty element when there are no entries', async () => {
      mockBdHistory.mockResolvedValue({ status: 'ok', data: [] })

      const { IssueDetailView } = await importSut()
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      fireEvent.click(screen.getByTestId('tab-history'))

      await waitFor(() => {
        expect(screen.getByTestId('history-empty')).toBeInTheDocument()
      })
      expect(screen.queryByTestId('history-list')).toBeNull()
    })

    it('omits the actor span and the details paragraph when those fields are null', async () => {
      mockBdHistory.mockResolvedValue({
        status: 'ok',
        data: [
          {
            id: 'commit-bare',
            issueId: 'beads-42',
            timestamp: '2026-01-01T00:00:00Z',
            action: 'created',
            actor: null,
            details: null,
          },
        ],
      })

      const { IssueDetailView } = await importSut()
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      fireEvent.click(screen.getByTestId('tab-history'))

      await waitFor(() => {
        expect(screen.getAllByTestId('history-row')).toHaveLength(1)
      })

      const row = screen.getByTestId('history-row')
      // The row rendered with the bare action text but without
      // the actor span or the details paragraph.
      expect(row.textContent).toContain('created')
      // The header is a `<div>` (not `<header>`), and exactly
      // TWO spans render — timestamp + action — the missing
      // actor span IS the assertion that the `e.actor ? ... :
      // null` branch took the null path.
      const headerSpans = row.querySelectorAll('div span')
      expect(headerSpans).toHaveLength(2)
      // No <p> element rendered for the missing details field.
      expect(row.querySelector('p')).toBeNull()
    })
  })

  // ponytail: the header's "(issue.labels ?? []).length > 0"
  // and "(issue.labels ?? []).map(...)" lines guard against
  // `issue.labels` being undefined on the wire (bd v1.0.4's
  // `bd list --json` omits the field entirely for issues with
  // no labels). The default fixture sets `labels: []`, which
  // hits the LEFT branch of the `??`. We drive an issue with
  // `labels: undefined` here to exercise the RIGHT branch.
  describe('IssueDetailView `?? []` defensive guards', () => {
    it('falls back to an empty array when issue.labels is undefined', async () => {
      mockBdShow.mockResolvedValue({
        status: 'ok',
        data: { ...issueFixture, labels: undefined },
      })

      const { IssueDetailView } = await importSut()
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      // No labels row rendered; no error thrown. The labels
      // array came back undefined and `?? []` fed `.length` and
      // `.map` with an empty array — both safe no-ops.
      await waitFor(() => {
        expect(screen.getByText('Fix the thing')).toBeInTheDocument()
      })
      expect(screen.queryByTestId('label-chip')).toBeNull()
    })
  })

  // ponytail: CommentsTab and HistoryTab both have `query.data ??
  // []` defensive guards — TanStack Query's type for `data` is
  // `T | undefined`, so the guards narrow the type for the sort
  // / length check. In practice the bd commands always return
  // an array, but the guard is part of the type contract. We
  // exercise it by returning `{ status: 'ok', data: undefined }`
  // — the query resolves with no payload, so `?? []` fires.
  describe('CommentsTab query.data ?? [] defensive guard', () => {
    it('treats a null payload as an empty list', async () => {
      // ponytail: TanStack Query v5 treats `queryFn()` returning
      // `undefined` as "still pending" — the query never resolves
      // to `data: undefined`. The defensive `query.data ?? []`
      // guard therefore targets the `data: null` case (the bd
      // commands can theoretically return a null payload when
      // the comment list is empty AND the wrapper serializer
      // collapses `[]` to null). Driving `data: null` exercises
      // the right-hand branch.
      mockBdComments.mockResolvedValue({ status: 'ok', data: null })

      const { IssueDetailView } = await importSut()
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      fireEvent.click(screen.getByTestId('tab-comments'))

      // The `?? []` branch hands `.length` and `.sort` an empty
      // array → `comments.length === 0` → empty branch fires.
      await waitFor(() => {
        expect(screen.getByTestId('comments-empty')).toBeInTheDocument()
      })
    })
  })

  describe('HistoryTab query.data ?? [] defensive guard', () => {
    it('treats a null payload as an empty entry list', async () => {
      mockBdHistory.mockResolvedValue({ status: 'ok', data: null })

      const { IssueDetailView } = await importSut()
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      fireEvent.click(screen.getByTestId('tab-history'))

      await waitFor(() => {
        expect(screen.getByTestId('history-empty')).toBeInTheDocument()
      })
    })
  })

  // ponytail: `formatBdError` has `??` fallbacks on `e.code`,
  // `e.path`, `e.repo_path`, `e.seconds`, and `e.message`. The
  // right-side branch (`'?'` or `''`) fires only when the field
  // is null/undefined. The tests above already exercise
  // NotFound / PermissionDenied / Timeout / AlreadyLocked
  // without their respective IDs / paths / seconds / repo
  // paths. Here we cover the remaining three `??` fallbacks:
  //   - NonZeroExit with `code: undefined`
  //   - IoError / SchemaMismatch / DoltOnly with `message: undefined`
  describe('formatBdError `??` fallback branches', () => {
    it('falls back to "(code=?)" when NonZeroExit omits the code', async () => {
      mockBdShow.mockResolvedValue({
        status: 'error',
        error: { type: 'NonZeroExit', stderr: 'something bad' },
      })

      const { IssueDetailView } = await importSut()
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      await waitFor(() => {
        expect(
          screen.getByText((_, element) => {
            const text = element?.textContent ?? ''
            return (
              text.startsWith('Failed to load issue:') &&
              text.includes('NonZeroExit (code=?)')
            )
          })
        ).toBeInTheDocument()
      })
    })

    it('falls back to an empty message for IoError without a message', async () => {
      mockBdShow.mockResolvedValue({
        status: 'error',
        error: { type: 'IoError' },
      })

      const { IssueDetailView } = await importSut()
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      await waitFor(() => {
        expect(
          screen.getByText((_, element) => {
            const text = element?.textContent ?? ''
            return (
              text.startsWith('Failed to load issue:') &&
              text.includes('IoError: ')
            )
          })
        ).toBeInTheDocument()
      })
    })

    it('falls back to an empty message for SchemaMismatch without a message', async () => {
      mockBdShow.mockResolvedValue({
        status: 'error',
        error: { type: 'SchemaMismatch' },
      })

      const { IssueDetailView } = await importSut()
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      await waitFor(() => {
        expect(
          screen.getByText((_, element) => {
            const text = element?.textContent ?? ''
            return (
              text.startsWith('Failed to load issue:') &&
              text.includes('SchemaMismatch: ')
            )
          })
        ).toBeInTheDocument()
      })
    })

    it('falls back to an empty message for DoltOnly without a message', async () => {
      mockBdShow.mockResolvedValue({
        status: 'error',
        error: { type: 'DoltOnly' },
      })

      const { IssueDetailView } = await importSut()
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      await waitFor(() => {
        expect(
          screen.getByText((_, element) => {
            const text = element?.textContent ?? ''
            return (
              text.startsWith('Failed to load issue:') &&
              text.includes('DoltOnly: ')
            )
          })
        ).toBeInTheDocument()
      })
    })
  })

  // ponytail: `formatBdError` is a private function — its public
  // surface is the header's "Failed to load issue: …" text. We
  // exercise every switch case + the two fallbacks (`Error`,
  // `String(err)`) by driving bdShow with each variant and asserting
  // on the rendered text. The 11 documented variants each get their
  // own test so a regression in any one is easy to localise.
  describe('formatBdError branches (M6 R9)', () => {
    const cases: {
      label: string
      err: unknown
      expectSubstring: string
    }[] = [
      {
        label: 'NotFound',
        err: { type: 'NotFound', id: 'beads-99' },
        expectSubstring: 'NotFound (id=beads-99)',
      },
      {
        label: 'NotFound without id',
        err: { type: 'NotFound' },
        expectSubstring: 'NotFound (id=?)',
      },
      {
        label: 'NonZeroExit with stderr',
        err: { type: 'NonZeroExit', code: 2, stderr: '  boom  ' },
        expectSubstring: 'NonZeroExit (code=2) stderr=boom',
      },
      {
        label: 'NonZeroExit with empty stderr',
        err: { type: 'NonZeroExit', code: 1 },
        expectSubstring: 'NonZeroExit (code=1) stderr=<empty>',
      },
      {
        label: 'ParseError',
        err: { type: 'ParseError', message: 'bad json' },
        expectSubstring: 'ParseError: bad json',
      },
      {
        label: 'ParseError without message',
        err: { type: 'ParseError' },
        expectSubstring: 'ParseError: ',
      },
      {
        label: 'IoError',
        err: { type: 'IoError', message: 'disk gone' },
        expectSubstring: 'IoError: disk gone',
      },
      {
        label: 'SchemaMismatch',
        err: { type: 'SchemaMismatch', message: 'wrong shape' },
        expectSubstring: 'SchemaMismatch: wrong shape',
      },
      {
        label: 'PermissionDenied',
        err: { type: 'PermissionDenied', path: '/etc/shadow' },
        expectSubstring: 'PermissionDenied (path=/etc/shadow)',
      },
      {
        label: 'PermissionDenied without path',
        err: { type: 'PermissionDenied' },
        expectSubstring: 'PermissionDenied (path=?)',
      },
      {
        label: 'BdNotInPath',
        err: { type: 'BdNotInPath' },
        expectSubstring: 'BdNotInPath',
      },
      {
        label: 'Timeout',
        err: { type: 'Timeout', seconds: 30 },
        expectSubstring: 'Timeout (seconds=30)',
      },
      {
        label: 'Timeout without seconds',
        err: { type: 'Timeout' },
        expectSubstring: 'Timeout (seconds=?)',
      },
      {
        label: 'DoltOnly',
        err: { type: 'DoltOnly', message: 'dolt required' },
        expectSubstring: 'DoltOnly: dolt required',
      },
      {
        label: 'AlreadyLocked',
        err: { type: 'AlreadyLocked', repo_path: '/repo/lock' },
        expectSubstring: 'AlreadyLocked (repo=/repo/lock)',
      },
      {
        label: 'AlreadyLocked without repo_path',
        err: { type: 'AlreadyLocked' },
        expectSubstring: 'AlreadyLocked (repo=?)',
      },
      {
        label: 'unknown variant → JSON.stringify fallback',
        err: { type: 'SomethingNew', payload: 42 },
        // JSON.stringify keeps the key order; assert on the
        // discriminator presence rather than the full string.
        expectSubstring: '"type":"SomethingNew"',
      },
      {
        label: 'plain Error → err.message',
        err: new Error('disk on fire'),
        expectSubstring: 'disk on fire',
      },
      {
        label: 'string → String(err)',
        err: 'something broke',
        expectSubstring: 'something broke',
      },
      {
        label: 'null → String(null)',
        err: null,
        expectSubstring: 'null',
      },
    ]

    for (const c of cases) {
      it(`renders the formatted error for ${c.label}`, async () => {
        mockBdShow.mockResolvedValue({ status: 'error', error: c.err })

        const { IssueDetailView } = await importSut()
        render(
          <IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />
        )

        // ponytail: `formatBdError`'s output is concatenated with
        // "Failed to load issue: " as a single text node in the
        // header's title slot. DescriptionTab renders its OWN
        // "Failed: …" copy via `String(err)` (with no prefix) —
        // a substring-only matcher would match the wrong element
        // when the formatted output is short (e.g. "null"). The
        // `startsWith('Failed to load issue:')` check pins the
        // match to the header's title block.
        await waitFor(() => {
          expect(
            screen.getByText((_, element) => {
              const text = element?.textContent ?? ''
              return (
                text.startsWith('Failed to load issue:') &&
                text.includes(c.expectSubstring)
              )
            })
          ).toBeInTheDocument()
        })
      })
    }
  })

  // ponytail: `formatDate` is private; it falls back to the raw
  // ISO string when `new Date(iso)` yields an Invalid Date. We
  // exercise this by driving the header with an unparseable
  // `created_at`.
  describe('formatDate invalid-date branch (M6 R9)', () => {
    it('returns the raw ISO string when the date is invalid', async () => {
      mockBdShow.mockResolvedValue({
        status: 'ok',
        data: { ...issueFixture, created_at: 'not-a-date' },
      })

      const { IssueDetailView } = await importSut()
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      // `formatDate` is private; the "created:" label is rendered
      // in the header meta row and contains the formatted result.
      await waitFor(() => {
        expect(screen.getByText(/^created: not-a-date$/)).toBeInTheDocument()
      })
    })
  })

  // ponytail: the Deps tab forwards `onOpenIssue` to
  // DependencyListView, or falls back to a noop. The fallback is
  // an inline `(() => {})` lambda with a noop body — clicking a dep
  // target id with the fallback in place must NOT throw.
  describe('Deps tab onOpenIssue fallback', () => {
    it('uses a noop fallback when onOpenIssue is not provided', async () => {
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

      const { IssueDetailView } = await importSut()
      // Note: onOpenIssue is intentionally omitted.
      render(<IssueDetailView cwd="/repo" issueId="beads-42" onClose={noop} />)

      fireEvent.click(screen.getByTestId('tab-deps'))
      await waitFor(() => {
        expect(screen.getByTestId('deps-section-blocks')).toBeInTheDocument()
      })

      // Clicking must not throw and must not propagate to a
      // missing handler. The test passes if `fireEvent.click`
      // resolves without an unhandled error.
      expect(() =>
        fireEvent.click(screen.getByTestId('dep-target-id'))
      ).not.toThrow()
    })
  })
})
