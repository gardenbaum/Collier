/**
 * Tests for GatesView — M6 R-Gates-UI: surface `bd gate list` in
 * the GUI as a read-only list.
 *
 * Contract:
 *   - Queries `commands.bdGateList(cwd, includeClosed)` and renders
 *     one row per GateEntry.
 *   - Each row carries `data-gate-id`, `data-gate-status`, and
 *     `data-gate-closed` so QA selectors can assert on the gate
 *     identity and lifecycle state.
 *   - Clicking a row calls `onOpenIssue(issue.id)` so the detail
 *     drawer opens for the gate.
 *   - The "Show closed" toggle flips `includeClosed` and re-runs
 *     the query with the new value (the same `bdGateList` mock is
 *     invoked twice with `true` then `false` or vice versa).
 *   - Empty / loading / error states are mutually exclusive.
 *
 * The view reuses the canonical Issue shape from the bindings —
 * each fixture row mirrors the bd wire format with the minimum
 * fields the view reads.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { render } from '@/test/test-utils'
import type { GateEntry, Issue } from '@/lib/bindings'

const { mockBdGateList } = vi.hoisted(() => ({
  mockBdGateList: vi.fn(),
}))

vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    bdGateList: mockBdGateList,
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

const importSut = () => import('./GatesView')

/** Build a minimal Issue fixture that satisfies the bindings
 * type. The view only reads `id`, `title`, `status`, `priority`,
 * and `created_at` — every other field is defaulted. */
function makeGateIssue(
  overrides: Partial<Issue> & { id: string; status: string }
): Issue {
  return {
    id: overrides.id,
    title: overrides.title ?? `Gate ${overrides.id}`,
    status: overrides.status,
    priority: overrides.priority ?? 'P2',
    issue_type: 'gate',
    created_at: overrides.created_at ?? '2026-06-25T00:00:00Z',
    updated_at: null,
    closed_at: null,
    description: null,
    owner: null,
    labels: [],
    dependencies: [],
    dependents: [],
    dependency_count: 0,
    dependent_count: 0,
    comment_count: 0,
    parent: null,
    acceptance_criteria: null,
    external_ref: null,
  } as Issue
}

/** Build a GateEntry — the Rust command maps each Issue to
 * `{ issue, is_closed }` where `is_closed` derives from the
 * status string (`closed` => true, everything else => false). */
function makeEntry(issue: Issue, isClosed: boolean): GateEntry {
  return { issue, isClosed }
}

describe('GatesView', () => {
  beforeEach(() => {
    mockBdGateList.mockReset()
  })

  it('renders one row per gate with status + priority + age', async () => {
    mockBdGateList.mockResolvedValue({
      status: 'ok',
      data: [
        makeEntry(makeGateIssue({ id: 'bd-gate-1', status: 'open' }), false),
        makeEntry(makeGateIssue({ id: 'bd-gate-2', status: 'closed' }), true),
      ] as GateEntry[],
    })

    const { GatesView } = await importSut()
    render(<GatesView cwd="/fake" onOpenIssue={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByTestId('gates-list')).toBeInTheDocument()
    })

    const rows = screen.getAllByTestId('gate-row')
    expect(rows).toHaveLength(2)
    // Identity + lifecycle state surface as data-* so QA selectors
    // can drill in without parsing text content.
    expect(rows[0]?.getAttribute('data-gate-id')).toBe('bd-gate-1')
    expect(rows[0]?.getAttribute('data-gate-closed')).toBe('false')
    expect(rows[1]?.getAttribute('data-gate-id')).toBe('bd-gate-2')
    expect(rows[1]?.getAttribute('data-gate-closed')).toBe('true')
  })

  it('renders the empty state when there are no gates', async () => {
    mockBdGateList.mockResolvedValue({
      status: 'ok',
      data: [] as GateEntry[],
    })

    const { GatesView } = await importSut()
    render(<GatesView cwd="/fake" onOpenIssue={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByTestId('gates-empty')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('gates-list')).not.toBeInTheDocument()
  })

  it('still renders the empty state when bdGateList resolves with a null data payload', async () => {
    // Defensive IPC path: `entries = data ?? []` was added to keep
    // the downstream `.filter(...)` call from throwing on a
    // malformed binding response where `data` is null/undefined
    // instead of the expected `GateEntry[]`. The Rust side always
    // sends an array, but a partially-updated tauri-specta enum
    // or a future schema regression could regress to this shape;
    // the view must keep rendering the empty state instead of
    // crashing on `.filter` of `null`.
    mockBdGateList.mockResolvedValue({
      status: 'ok',
      data: null,
    } as never)

    const { GatesView } = await importSut()
    render(<GatesView cwd="/fake" onOpenIssue={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByTestId('gates-empty')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('gates-list')).not.toBeInTheDocument()
  })

  it('renders the error state when bdGateList fails', async () => {
    mockBdGateList.mockResolvedValue({
      status: 'error',
      error: {
        type: 'NonZeroExit',
        code: 1,
        stdout: '',
        stderr: 'fatal: not a beads repository',
      },
    })

    const { GatesView } = await importSut()
    render(<GatesView cwd="/fake" onOpenIssue={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByTestId('gates-error')).toBeInTheDocument()
    })
    expect(screen.getByTestId('gates-error').textContent).toContain(
      'not a beads repository'
    )
    expect(screen.queryByTestId('gates-list')).not.toBeInTheDocument()
    expect(screen.queryByTestId('gates-empty')).not.toBeInTheDocument()
  })

  it('clicking a row calls onOpenIssue with the gate id', async () => {
    mockBdGateList.mockResolvedValue({
      status: 'ok',
      data: [
        makeEntry(makeGateIssue({ id: 'bd-gate-7', status: 'open' }), false),
      ] as GateEntry[],
    })

    const onOpenIssue = vi.fn()
    const { GatesView } = await importSut()
    render(<GatesView cwd="/fake" onOpenIssue={onOpenIssue} />)

    await waitFor(() => {
      expect(screen.getByTestId('gates-list')).toBeInTheDocument()
    })

    const row = screen.getByTestId('gate-row')
    await fireEvent.click(row)
    expect(onOpenIssue).toHaveBeenCalledWith('bd-gate-7')
  })

  it('toggling "Show closed" refetches with includeClosed=true', async () => {
    // Two-step fetch: initial open-only, then expand to include
    // closed. The Rust command reads the `includeClosed` arg and
    // passes `--all` to `bd gate list`; the test verifies the
    // toggle flows through to the IPC boundary.
    mockBdGateList
      .mockResolvedValueOnce({
        status: 'ok',
        data: [
          makeEntry(makeGateIssue({ id: 'bd-gate-1', status: 'open' }), false),
        ] as GateEntry[],
      })
      .mockResolvedValueOnce({
        status: 'ok',
        data: [
          makeEntry(makeGateIssue({ id: 'bd-gate-1', status: 'open' }), false),
          makeEntry(makeGateIssue({ id: 'bd-gate-2', status: 'closed' }), true),
        ] as GateEntry[],
      })

    const { GatesView } = await importSut()
    render(<GatesView cwd="/fake" onOpenIssue={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByTestId('gates-list')).toBeInTheDocument()
    })
    expect(mockBdGateList).toHaveBeenLastCalledWith('/fake', false)

    const toggle = screen.getByTestId('gates-toggle-include-closed')
    await fireEvent.click(toggle)

    await waitFor(() => {
      expect(mockBdGateList).toHaveBeenLastCalledWith('/fake', true)
    })
    // aria/data state mirrors the boolean. Re-query after the
    // refetch so the toggle reflects the post-click includeClosed
    // value (the initial `toggle` reference may be stale by the
    // time the React reconciler flushes).
    await waitFor(() => {
      expect(
        screen
          .getByTestId('gates-toggle-include-closed')
          .getAttribute('data-active')
      ).toBe('true')
    })
    await waitFor(() => {
      expect(screen.getAllByTestId('gate-row')).toHaveLength(2)
    })
  })

  it('renders gates with non-built-in (custom) statuses without crashing', async () => {
    // M6 R-Custom-Status: a workspace with `bd config set
    // status.custom "review:wip"` can produce gates carrying a
    // non-built-in status. The view must render them (the StatusPill
    // falls back to the muted palette) — this guards against a
    // future refactor that re-introduces the closed enum.
    mockBdGateList.mockResolvedValue({
      status: 'ok',
      data: [
        makeEntry(makeGateIssue({ id: 'bd-gate-1', status: 'review' }), false),
        makeEntry(makeGateIssue({ id: 'bd-gate-2', status: 'on_hold' }), false),
      ] as GateEntry[],
    })

    const { GatesView } = await importSut()
    render(<GatesView cwd="/fake" onOpenIssue={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByTestId('gates-list')).toBeInTheDocument()
    })

    const rows = screen.getAllByTestId('gate-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.getAttribute('data-gate-status')).toBe('review')
    expect(rows[1]?.getAttribute('data-gate-status')).toBe('on_hold')
  })
})

describe('GatesView - relativeAge buckets', () => {
  // Freeze the wall clock so `relativeAge(issue.created_at)` returns
  // deterministic bucket labels. Following the pattern established in
  // src/components/preferences/panes/AdvancedPane.test.tsx we fake
  // ONLY Date — setTimeout/setInterval stay real so React's render
  // flush (and waitFor's internal setTimeout fallback) keeps working.
  // Pin "now" to a known instant in the future of the fixture's
  // reference date so we can offset backward through every bucket.
  const FROZEN_NOW = new Date('2026-07-21T12:00:00.000Z')

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(FROZEN_NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders "just now" for an entry created less than a minute ago', async () => {
    // 30s ago < 60_000 ms -> "just now" branch
    const thirtySecondsAgo = new Date(
      FROZEN_NOW.getTime() - 30 * 1000
    ).toISOString()

    mockBdGateList.mockResolvedValue({
      status: 'ok',
      data: [
        makeEntry(
          makeGateIssue({
            id: 'bd-gate-just-now',
            status: 'open',
            created_at: thirtySecondsAgo,
          }),
          false
        ),
      ] as GateEntry[],
    })

    const { GatesView } = await importSut()
    render(<GatesView cwd="/fake" onOpenIssue={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByTestId('gates-list')).toBeInTheDocument()
    })

    expect(screen.getByTestId('gate-row').textContent).toContain('just now')
  })

  it('renders "Xm ago" for an entry created between 1 and 59 minutes ago', async () => {
    // 15 minutes ago < 3_600_000 ms -> minutes bucket
    const fifteenMinutesAgo = new Date(
      FROZEN_NOW.getTime() - 15 * 60 * 1000
    ).toISOString()

    mockBdGateList.mockResolvedValue({
      status: 'ok',
      data: [
        makeEntry(
          makeGateIssue({
            id: 'bd-gate-minutes',
            status: 'open',
            created_at: fifteenMinutesAgo,
          }),
          false
        ),
      ] as GateEntry[],
    })

    const { GatesView } = await importSut()
    render(<GatesView cwd="/fake" onOpenIssue={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByTestId('gates-list')).toBeInTheDocument()
    })

    expect(screen.getByTestId('gate-row').textContent).toContain('15m ago')
  })

  it('renders "Xh ago" for an entry created between 1 and 23 hours ago', async () => {
    // 5 hours ago < 86_400_000 ms -> hours bucket
    const fiveHoursAgo = new Date(
      FROZEN_NOW.getTime() - 5 * 60 * 60 * 1000
    ).toISOString()

    mockBdGateList.mockResolvedValue({
      status: 'ok',
      data: [
        makeEntry(
          makeGateIssue({
            id: 'bd-gate-hours',
            status: 'open',
            created_at: fiveHoursAgo,
          }),
          false
        ),
      ] as GateEntry[],
    })

    const { GatesView } = await importSut()
    render(<GatesView cwd="/fake" onOpenIssue={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByTestId('gates-list')).toBeInTheDocument()
    })

    expect(screen.getByTestId('gate-row').textContent).toContain('5h ago')
  })

  it('returns the raw ISO string for a timestamp that fails to parse', async () => {
    // Number.isNaN(Date.parse('definitely-not-a-date')) -> NaN -> raw
    // string fallback. The bd wire format guarantees RFC3339, but a
    // partially corrupt row shouldn't crash the view; it should
    // surface the raw payload so the operator can still click into
    // the issue detail drawer.
    mockBdGateList.mockResolvedValue({
      status: 'ok',
      data: [
        makeEntry(
          makeGateIssue({
            id: 'bd-gate-broken',
            status: 'open',
            created_at: 'definitely-not-a-date',
          }),
          false
        ),
      ] as GateEntry[],
    })

    const { GatesView } = await importSut()
    render(<GatesView cwd="/fake" onOpenIssue={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByTestId('gates-list')).toBeInTheDocument()
    })

    expect(screen.getByTestId('gate-row').textContent).toContain(
      'definitely-not-a-date'
    )
  })
})

describe('GatesView - closed entry branches', () => {
  it('reports openCount excluding closed entries and styles closed rows with reduced opacity', async () => {
    // The toolbar's "open gates" counter is `entries.filter(e =>
    // !e.isClosed).length` — both branches of the negation must be
    // hit (the existing rows test covers this implicitly, but here
    // we make the intent explicit so a future fixture refactor
    // can't silently regress the closed-row path).
    //
    // The GateRow ternary `style = isClosed ? rowClosedStyle :
    // rowStyle` produces `opacity: 0.55` on closed rows; we assert
    // through the inline style attribute to pin both branches of
    // that ternary in one test.
    mockBdGateList.mockResolvedValue({
      status: 'ok',
      data: [
        makeEntry(makeGateIssue({ id: 'bd-open-a', status: 'open' }), false),
        makeEntry(makeGateIssue({ id: 'bd-open-b', status: 'open' }), false),
        makeEntry(makeGateIssue({ id: 'bd-closed-1', status: 'closed' }), true),
      ] as GateEntry[],
    })

    const { GatesView } = await importSut()
    render(<GatesView cwd="/fake" onOpenIssue={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByTestId('gates-list')).toBeInTheDocument()
    })

    // 2 open + 1 closed -> toolbar reads "2 open gates" (the
    // includeClosed=false branch of the openCount ternary).
    const toolbar = screen.getByTestId('gates-toolbar')
    expect(toolbar.textContent).toContain('2')
    expect(toolbar.textContent).toMatch(/open gate/i)

    const rows = screen.getAllByTestId('gate-row')
    expect(rows).toHaveLength(3)
    // data-gate-closed pins the lifecycle state on each row.
    expect(rows[0]?.getAttribute('data-gate-closed')).toBe('false')
    expect(rows[1]?.getAttribute('data-gate-closed')).toBe('false')
    expect(rows[2]?.getAttribute('data-gate-closed')).toBe('true')
    // rowClosedStyle applies opacity: 0.55 to closed rows;
    // rowStyle leaves opacity at the default (empty string from
    // JSDOM's serializer).
    expect((rows[2] as HTMLElement).style.opacity).toBe('0.55')
    expect((rows[0] as HTMLElement).style.opacity).toBe('')
  })

  it('keeps the rowClosedStyle branch and zero openCount when every entry is closed', async () => {
    // All-closed entry set -> filter returns zero elements -> the
    // `!e.isClosed` predicate's false branch is exercised for every
    // entry (rather than once-or-twice in a mixed fixture). Also
    // pins the "0 open gates" pluralization key.
    mockBdGateList.mockResolvedValue({
      status: 'ok',
      data: [
        makeEntry(makeGateIssue({ id: 'bd-closed-x', status: 'closed' }), true),
        makeEntry(makeGateIssue({ id: 'bd-closed-y', status: 'closed' }), true),
      ] as GateEntry[],
    })

    const { GatesView } = await importSut()
    render(<GatesView cwd="/fake" onOpenIssue={() => undefined} />)

    await waitFor(() => {
      expect(screen.getByTestId('gates-list')).toBeInTheDocument()
    })

    const toolbar = screen.getByTestId('gates-toolbar')
    expect(toolbar.textContent).toContain('0')
    expect(toolbar.textContent).toMatch(/open gate/i)

    const rows = screen.getAllByTestId('gate-row')
    rows.forEach(row => {
      expect(row.getAttribute('data-gate-closed')).toBe('true')
      expect((row as HTMLElement).style.opacity).toBe('0.55')
    })
  })

  it('clicking a closed row still fires onOpenIssue with the gate id', async () => {
    // The existing row click test exercises the open branch only;
    // pin the closed-entry click path independently so the
    // onActivate handler can't regress to a closed-row no-op
    // (e.g. by short-circuiting on `isClosed`).
    mockBdGateList.mockResolvedValue({
      status: 'ok',
      data: [
        makeEntry(
          makeGateIssue({ id: 'bd-gate-closed-click', status: 'closed' }),
          true
        ),
      ] as GateEntry[],
    })

    const onOpenIssue = vi.fn()
    const { GatesView } = await importSut()
    render(<GatesView cwd="/fake" onOpenIssue={onOpenIssue} />)

    await waitFor(() => {
      expect(screen.getByTestId('gates-list')).toBeInTheDocument()
    })

    const row = screen.getByTestId('gate-row')
    await fireEvent.click(row)
    expect(onOpenIssue).toHaveBeenCalledWith('bd-gate-closed-click')
  })
})
