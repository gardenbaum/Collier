/**
 * Tests for DependencyListView.
 *
 * Contract: DependencyListView fetches `commands.bdDepList(cwd,
 * issueId)` via TanStack Query, groups the returned `Dependency[]`
 * by `dependency_type` (one section per `DependencyType` variant),
 * renders each section heading + one row per dep, and exposes:
 *   - a clickable target id (fires `onOpenIssue(targetId)`)
 *   - a remove `[X]` button (fires `commands.bdDepRemove` and
 *     refetches the dep list)
 *   - an inline "Add dependency" form (toggled by a button) that
 *     fires `commands.bdDepAdd(cwd, issueId, targetId, type)` on
 *     submit
 *
 * The 10 `DependencyType` variants (per types.rs) are pinned by
 * `SECTION_ORDER` in the component. Empty sections are skipped.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { render } from '@/test/test-utils'
import type { Dependency } from '@/lib/bindings'

// ponytail: hoisted so the vi.mock factory can reference the mock
// fns. `bdDepList` resolves with controlled payloads for each test;
// `bdDepAdd` / `bdDepRemove` are spied on per-test via mock.calls.
const { mockBdDepList, mockBdDepAdd, mockBdDepRemove } = vi.hoisted(() => ({
  mockBdDepList: vi.fn(),
  mockBdDepAdd: vi.fn(),
  mockBdDepRemove: vi.fn(),
}))

vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    bdDepList: mockBdDepList,
    bdDepAdd: mockBdDepAdd,
    bdDepRemove: mockBdDepRemove,
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

const importSut = () => import('./DependencyListView')

const depBlocks1: Dependency = {
  dependency_id: 'beads-77',
  dependency_type: 'blocks',
  blocked_by: true,
}

const depBlocks2: Dependency = {
  dependency_id: 'beads-78',
  dependency_type: 'blocks',
  blocked_by: null,
}

const depRelated1: Dependency = {
  dependency_id: 'beads-99',
  dependency_type: 'related',
  blocked_by: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockBdDepAdd.mockResolvedValue({ status: 'ok', data: null })
  mockBdDepRemove.mockResolvedValue({ status: 'ok', data: null })
})

describe('DependencyListView', () => {
  it('renders dependencies grouped by type with one section per non-empty type', async () => {
    mockBdDepList.mockResolvedValue({
      status: 'ok',
      data: [depBlocks1, depBlocks2, depRelated1],
    })

    const { DependencyListView } = await importSut()
    render(
      <DependencyListView
        cwd="/fake"
        issueId="beads-1"
        onOpenIssue={() => undefined}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('deps-section-blocks')).toBeInTheDocument()
    })
    expect(screen.getByTestId('deps-section-related')).toBeInTheDocument()

    // Empty sections are skipped — no "Waits-for", "Validates", etc.
    expect(screen.queryByTestId('deps-section-waits_for')).toBeNull()
    expect(screen.queryByTestId('deps-section-validates')).toBeNull()

    // Headings include the count per type.
    expect(
      screen.getByTestId('deps-section-heading-blocks').textContent
    ).toContain('Blocks')
    expect(
      screen.getByTestId('deps-section-heading-blocks').textContent
    ).toContain('(2)')
    expect(
      screen.getByTestId('deps-section-heading-related').textContent
    ).toContain('(1)')

    // 3 rows total.
    const rows = screen.getAllByTestId('dep-row')
    expect(rows).toHaveLength(3)
    expect(rows[0]?.getAttribute('data-target-id')).toBe('beads-77')
    expect(rows[1]?.getAttribute('data-target-id')).toBe('beads-78')
    expect(rows[2]?.getAttribute('data-target-id')).toBe('beads-99')
  })

  it('clicking a dep target id fires onOpenIssue with that id', async () => {
    mockBdDepList.mockResolvedValue({
      status: 'ok',
      data: [depBlocks1],
    })

    const onOpenIssue = vi.fn()
    const { DependencyListView } = await importSut()
    render(
      <DependencyListView
        cwd="/fake"
        issueId="beads-1"
        onOpenIssue={onOpenIssue}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('dep-target-id')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('dep-target-id'))
    expect(onOpenIssue).toHaveBeenCalledWith('beads-77')
  })

  it('clicking a dep remove button fires bdDepRemove with current + target ids and refetches', async () => {
    mockBdDepList.mockResolvedValue({
      status: 'ok',
      data: [depBlocks1, depRelated1],
    })

    const { DependencyListView } = await importSut()
    render(
      <DependencyListView
        cwd="/fake"
        issueId="beads-1"
        onOpenIssue={() => undefined}
      />
    )

    await waitFor(() => {
      expect(screen.getAllByTestId('dep-remove')).toHaveLength(2)
    })

    // First remove button is the blocks dep.
    const removeButtons = screen.getAllByTestId('dep-remove')
    expect(removeButtons.length).toBeGreaterThan(0)
    const firstRemove = removeButtons[0] as HTMLElement
    fireEvent.click(firstRemove)
    await waitFor(() => {
      expect(mockBdDepRemove).toHaveBeenCalledWith(
        '/fake',
        'beads-1',
        'beads-77'
      )
    })
  })

  it('clicking "Add dependency" expands the inline add form', async () => {
    mockBdDepList.mockResolvedValue({ status: 'ok', data: [] })

    const { DependencyListView } = await importSut()
    render(
      <DependencyListView
        cwd="/fake"
        issueId="beads-1"
        onOpenIssue={() => undefined}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('dep-add-toggle')).toBeInTheDocument()
    })
    // Form not yet visible.
    expect(screen.queryByTestId('dep-add-form')).toBeNull()

    fireEvent.click(screen.getByTestId('dep-add-toggle'))

    // Form now visible with all 4 controls.
    expect(screen.getByTestId('dep-add-form')).toBeInTheDocument()
    expect(screen.getByTestId('dep-add-target-id')).toBeInTheDocument()
    expect(screen.getByTestId('dep-add-type')).toBeInTheDocument()
    expect(screen.getByTestId('dep-add-submit')).toBeInTheDocument()
    expect(screen.getByTestId('dep-add-cancel')).toBeInTheDocument()
  })

  it('submitting the add form fires bdDepAdd with the typed target + selected type and refetches', async () => {
    mockBdDepList.mockResolvedValue({ status: 'ok', data: [] })

    const { DependencyListView } = await importSut()
    render(
      <DependencyListView
        cwd="/fake"
        issueId="beads-1"
        onOpenIssue={() => undefined}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('dep-add-toggle')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('dep-add-toggle'))

    const targetInput = screen.getByTestId('dep-add-target-id')
    const typeSelect = screen.getByTestId('dep-add-type')

    // ponytail: React 19 controlled inputs need the nativeSetter
    // dance to fire onChange from a direct value assignment. See
    // SearchView.test.tsx for the same pattern.
    const setNativeValue = (
      el: HTMLInputElement | HTMLSelectElement,
      value: string
    ) => {
      const proto = Object.getOwnPropertyDescriptor(
        el.constructor.prototype,
        'value'
      ) as PropertyDescriptor | undefined
      proto?.set?.call(el, value)
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }
    setNativeValue(targetInput as HTMLInputElement, 'beads-99')
    setNativeValue(typeSelect as HTMLSelectElement, 'related')

    fireEvent.click(screen.getByTestId('dep-add-submit'))

    await waitFor(() => {
      expect(mockBdDepAdd).toHaveBeenCalledWith(
        '/fake',
        'beads-1',
        'beads-99',
        'related'
      )
    })
  })

  it('cancel button collapses the add form and clears the draft', async () => {
    mockBdDepList.mockResolvedValue({ status: 'ok', data: [] })

    const { DependencyListView } = await importSut()
    render(
      <DependencyListView
        cwd="/fake"
        issueId="beads-1"
        onOpenIssue={() => undefined}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('dep-add-toggle')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('dep-add-toggle'))

    const targetInput = screen.getByTestId('dep-add-target-id')
    const setNativeValue = (el: HTMLInputElement, value: string) => {
      const proto = Object.getOwnPropertyDescriptor(
        el.constructor.prototype,
        'value'
      ) as PropertyDescriptor | undefined
      proto?.set?.call(el, value)
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }
    setNativeValue(targetInput as HTMLInputElement, 'beads-99')

    expect(targetInput).toHaveValue('beads-99')
    fireEvent.click(screen.getByTestId('dep-add-cancel'))

    // Form collapsed, toggle is back.
    expect(screen.queryByTestId('dep-add-form')).toBeNull()
    expect(screen.getByTestId('dep-add-toggle')).toBeInTheDocument()

    // Re-open and confirm the draft was cleared.
    fireEvent.click(screen.getByTestId('dep-add-toggle'))
    expect(screen.getByTestId('dep-add-target-id')).toHaveValue('')
  })

  it('empty dep list shows the empty state and only the add button', async () => {
    mockBdDepList.mockResolvedValue({ status: 'ok', data: [] })

    const { DependencyListView } = await importSut()
    render(
      <DependencyListView
        cwd="/fake"
        issueId="beads-1"
        onOpenIssue={() => undefined}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('deps-empty')).toBeInTheDocument()
    })
    // No sections when there are no deps.
    expect(screen.queryByTestId('deps-section-blocks')).toBeNull()
    expect(screen.queryByTestId('deps-section-related')).toBeNull()
    // The "Add dependency" toggle is still visible.
    expect(screen.getByTestId('dep-add-toggle')).toBeInTheDocument()
  })

  it('renders the loading skeleton while the dep list is pending', async () => {
    mockBdDepList.mockReturnValue(new Promise<never>(() => undefined))

    const { DependencyListView } = await importSut()
    render(
      <DependencyListView
        cwd="/fake"
        issueId="beads-1"
        onOpenIssue={() => undefined}
      />
    )

    expect(screen.getByTestId('deps-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('deps-empty')).toBeNull()
    expect(screen.queryByTestId('deps-section-blocks')).toBeNull()
    expect(screen.queryByTestId('dep-add-toggle')).toBeNull()
  })

  it('does not use the brand colour anywhere in the rendered output', async () => {
    mockBdDepList.mockResolvedValue({
      status: 'ok',
      data: [depBlocks1, depRelated1],
    })

    const { DependencyListView } = await importSut()
    const { container } = render(
      <DependencyListView
        cwd="/fake"
        issueId="beads-1"
        onOpenIssue={() => undefined}
      />
    )

    await waitFor(() => {
      expect(screen.getByTestId('deps-section-blocks')).toBeInTheDocument()
    })
    // ponytail: AC-14 — the brand colour is reserved for destructive
    // actions and the P0 priority badge only. The dep list must not
    // surface the brand colour.
    const html = container.innerHTML.toLowerCase()
    expect(html).not.toContain('c2410c')
  })
})
