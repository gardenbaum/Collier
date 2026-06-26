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
import { describe, it, expect, vi, beforeEach } from 'vitest'
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
