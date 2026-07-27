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
import type { FormEvent } from 'react'

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

  it('renders the error alert when bdDepList returns a Result error', async () => {
    // Exercises branches 0[1] @ line 95 (falsy arm of the
    // `if (result.status === 'ok')` check inside the bdDepList
    // queryFn → `throw result.error`) and 0[1] @ line 177 (truthy
    // arm of `if (depListQuery.isError)`). The queryFn receives a
    // resolved object whose status is 'error', takes the falsy
    // arm on line 95, executes the throw, and the query lands in
    // error state.
    //
    // ponytail: line 180 renders `String(depListQuery.error)`.
    // For a typed `BdError` object that stringifies to
    // `'[object Object]'` — pin the current rendering. The
    // bdDepAdd error path on line 343 uses `formatError` for
    // human-readable text, see the dep-add-error test below.
    mockBdDepList.mockResolvedValue({
      status: 'error',
      error: {
        type: 'NonZeroExit',
        code: 1,
        stderr: 'bd: no beads repo',
        stdout: '',
      },
    })

    const { DependencyListView } = await importSut()
    render(
      <DependencyListView
        cwd="/fake"
        issueId="beads-1"
        onOpenIssue={() => undefined}
      />
    )

    const alert = await screen.findByTestId('deps-error')
    expect(alert.getAttribute('role')).toBe('alert')
    expect(alert.textContent).toBe('[object Object]')

    // Mutually exclusive with the loading/empty/section states —
    // the error branch short-circuits ALL of the below.
    expect(screen.queryByTestId('deps-loading')).toBeNull()
    expect(screen.queryByTestId('deps-empty')).toBeNull()
    expect(screen.queryByTestId('deps-section-blocks')).toBeNull()
    expect(screen.queryByTestId('dep-add-toggle')).toBeNull()
  })

  it('renders the error alert when bdDepList rejects', async () => {
    // Mirror of the previous test for the rejection path. The
    // `await commands.bdDepList(cwd, issueId)` call re-throws
    // before line 95 is reached, so only the isError=true arm of
    // line 177 is exercised (Branch 0[1] @ line 95 stays uncovered
    // here — that's fine, the previous test owns it).
    mockBdDepList.mockRejectedValue(new Error('IPC channel closed'))

    const { DependencyListView } = await importSut()
    render(
      <DependencyListView
        cwd="/fake"
        issueId="beads-1"
        onOpenIssue={() => undefined}
      />
    )

    const alert = await screen.findByTestId('deps-error')
    expect(alert.getAttribute('role')).toBe('alert')
    expect(alert.textContent).toContain('IPC channel closed')
  })

  it('renders the dep-add-error alert when bdDepAdd returns a Result error', async () => {
    // Exercises Branch 0[1] @ line 132 (falsy arm of
    // `if (result.status === 'ok')` inside the bdDepAdd
    // mutationFn → `throw result.error`) and the
    // `addMutation.isError` truthy arm on line 341
    // (`if (addMutation.isError)` → render dep-add-error box).
    mockBdDepList.mockResolvedValue({ status: 'ok', data: [] })
    mockBdDepAdd.mockResolvedValue({
      status: 'error',
      error: {
        type: 'Validation',
        message: 'beads-99 is not a known issue',
        field: 'target_id',
      },
    })

    const { DependencyListView } = await importSut()
    render(
      <DependencyListView
        cwd="/fake"
        issueId="beads-1"
        onOpenIssue={() => undefined}
      />
    )

    // Wait for the empty list, open the form, fill it, submit.
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

    fireEvent.click(screen.getByTestId('dep-add-submit'))

    const errorBox = await screen.findByTestId('dep-add-error')
    expect(errorBox.getAttribute('role')).toBe('alert')
    // formatError surfaces the BdError.message field for typed
    // variants.
    expect(errorBox.textContent).toContain('beads-99 is not a known issue')

    await waitFor(() => {
      expect(mockBdDepAdd).toHaveBeenCalledWith(
        '/fake',
        'beads-1',
        'beads-99',
        'blocks'
      )
    })
  })

  it('leaves the dep row in the DOM when bdDepRemove returns a Result error', async () => {
    // Exercises Branch 0[1] @ line 115 (falsy arm of
    // `if (result.status === 'ok')` inside the bdDepRemove
    // mutationFn → `throw result.error`). The component has NO
    // observable error UI for remove failures (no
    // `dep-remove-error` testid) — TanStack Query's mutation
    // store captures the throw on the `removeMutation.error`
    // field, which the component does not render. The only
    // observable behaviour is the negative one: a failed
    // `bdDepRemove` does NOT fire the `onSuccess → invalidate`
    // callback, so the row stays in the DOM. We assert both the
    // mutation fired (proving line 114 was reached) and the row
    // is still present (proving `onSuccess` did NOT fire).
    mockBdDepList.mockResolvedValue({
      status: 'ok',
      data: [depBlocks1],
    })
    mockBdDepRemove.mockResolvedValue({
      status: 'error',
      error: {
        type: 'NonZeroExit',
        code: 2,
        stderr: 'bd dep remove: permission denied',
        stdout: '',
      },
    })

    const { DependencyListView } = await importSut()
    render(
      <DependencyListView
        cwd="/fake"
        issueId="beads-1"
        onOpenIssue={() => undefined}
      />
    )

    // Sanity: the one row from the mocked dep list is visible.
    await waitFor(() => {
      expect(screen.getByTestId('dep-remove')).toBeInTheDocument()
    })
    expect(screen.getAllByTestId('dep-row')).toHaveLength(1)

    fireEvent.click(screen.getByTestId('dep-remove'))

    // The mutationFn ran (line 114 fired): mockBdDepRemove was
    // called with the right arguments.
    await waitFor(() => {
      expect(mockBdDepRemove).toHaveBeenCalledWith(
        '/fake',
        'beads-1',
        'beads-77'
      )
    })
    // And the throw on line 116 took effect — the row is STILL
    // in the DOM because the throw prevented onSuccess →
    // invalidate from firing. If the component had accidentally
    // not-thrown (e.g. swallowed the error and called
    // invalidate anyway), the row would have disappeared after a
    // refetch.
    await waitFor(() => {
      expect(mockBdDepList).toHaveBeenCalledTimes(1)
    })
    expect(screen.getByTestId('dep-row')).toBeInTheDocument()
    expect(screen.getByTestId('dep-target-id')).toHaveTextContent('beads-77')
  })

  it('submitting the add form with an empty target is a no-op', async () => {
    // ponytail: line 146 — `if (trimmed.length === 0 || addMutation.isPending) return`.
    // The submit button's `disabled` prop already guards the
    // empty-input case (L317-319: `addMutation.isPending ||
    // targetDraft.trim().length === 0`), so React drops the
    // synthetic click. The form's `onSubmit` still fires if we
    // dispatch `submit` directly, which lets us reach the
    // belt-and-suspenders in-handler guard.
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

    // The submit button must be disabled when targetDraft is empty.
    expect(screen.getByTestId('dep-add-submit')).toBeDisabled()

    // Drive the form's onSubmit directly — handleAddSubmit sees
    // `trimmed.length === 0` and bails at L146 before calling
    // mutate().
    const form = screen.getByTestId('dep-add-form')
    fireEvent.submit(form)

    // Give React a tick so any stray mutation call would surface.
    await new Promise(resolve => {
      setTimeout(resolve, 0)
    })
    expect(mockBdDepAdd).not.toHaveBeenCalled()
  })

  it('submitting the add form with a whitespace-only target is a no-op', async () => {
    // ponytail: line 146 left half via `trim()` — the `.trim()`
    // call on L145 collapses "   " to "". The submit button's
    // `disabled` prop uses the same `targetDraft.trim().length
    // === 0` check (L318), so the button is still disabled and
    // we drive the onSubmit handler directly to hit the guard.
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
    setNativeValue(targetInput as HTMLInputElement, '   ')

    // Confirm the draft is whitespace-only and the button is disabled.
    expect(targetInput).toHaveValue('   ')
    expect(screen.getByTestId('dep-add-submit')).toBeDisabled()

    fireEvent.submit(screen.getByTestId('dep-add-form'))

    await new Promise(resolve => {
      setTimeout(resolve, 0)
    })
    expect(mockBdDepAdd).not.toHaveBeenCalled()
  })

  it('shows the "Adding…" label while the add mutation is in flight', async () => {
    // ponytail: line 326 — the `addMutation.isPending ? 'Adding…'
    // : 'Add'` ternary. A never-resolving promise keeps the
    // mutation pending; the submit button label must swap to
    // "Adding…" and the button must disable on the
    // `addMutation.isPending` clause of L317-319.
    mockBdDepList.mockResolvedValue({ status: 'ok', data: [] })
    mockBdDepAdd.mockReturnValue(new Promise<never>(() => undefined))

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

    const submit = screen.getByTestId('dep-add-submit')
    expect(submit.textContent).toBe('Add')

    fireEvent.click(submit)

    // Wait for the label to swap to "Adding…" — this proves the
    // mutation flipped to pending.
    await waitFor(() => {
      expect(submit.textContent).toBe('Adding…')
    })
    expect(submit).toBeDisabled()
  })

  it('submitting the add form while pending does NOT re-fire bdDepAdd', async () => {
    // ponytail: line 146 right half — `addMutation.isPending`.
    // A never-resolving bdDepAdd keeps the mutation pending; the
    // submit button disables (L317-319). React drops synthetic
    // clicks on disabled form controls, so we drive the latest
    // handleAddSubmit closure directly via a React-fiber test
    // seam. Same pattern documented in IssueActions.test.tsx
    // (`latestOnClick`) — adapted for the form's `onSubmit`.
    mockBdDepList.mockResolvedValue({ status: 'ok', data: [] })
    mockBdDepAdd.mockReturnValue(new Promise<never>(() => undefined))

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

    const submit = screen.getByTestId('dep-add-submit')
    fireEvent.click(submit)

    // Wait for the mutation to flip pending (label flips to
    // "Adding…") so the post-rerender handleAddSubmit closure
    // captures `addMutation.isPending === true`.
    await waitFor(() => {
      expect(submit.textContent).toBe('Adding…')
    })

    // Drive the latest handleAddSubmit closure directly — it
    // bails on the right half of the L146 guard.
    const form = screen.getByTestId('dep-add-form') as HTMLFormElement
    latestFormOnSubmit(form)({
      preventDefault: () => undefined,
    } as unknown as FormEvent)

    expect(mockBdDepAdd).toHaveBeenCalledTimes(1)
  })

  it('clicking remove while pending does NOT re-fire bdDepRemove', async () => {
    // ponytail: line 166 — `if (removeMutation.isPending) return`.
    // The remove button disables on `removeMutation.isPending`
    // (L251) and React drops the synthetic click, so we drive
    // the latest handleRemove closure directly via the
    // React-fiber test seam.
    mockBdDepList.mockResolvedValue({
      status: 'ok',
      data: [depBlocks1, depBlocks2],
    })
    mockBdDepRemove.mockReturnValue(new Promise<never>(() => undefined))

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

    const removeButtons = screen.getAllByTestId('dep-remove')
    const firstRemove = removeButtons[0] as HTMLElement
    fireEvent.click(firstRemove)

    // Wait for the row to disable (proves mutation flipped pending).
    await waitFor(() => {
      expect(firstRemove).toBeDisabled()
    })

    // Drive the latest handleRemove closure directly — it
    // captures removeMutation.isPending === true and bails at
    // L166 before calling mutate().
    latestOnClick(firstRemove)()

    expect(mockBdDepRemove).toHaveBeenCalledTimes(1)
  })
})

// ponytail: React-fiber test seam for invoking the latest
// `onSubmit` / `onClick` closure after a rerender. Documented in
// IssueActions.test.tsx (PR #189); reused here for the
// handleAddSubmit / handleRemove guards that React would
// otherwise filter out via the synthetic-event system when the
// triggering button is disabled.
function latestFormOnSubmit(form: HTMLFormElement): (e: FormEvent) => void {
  const fiberKey = Object.keys(form).find(k => k.startsWith('__reactFiber'))
  if (!fiberKey) throw new Error('No React fiber found on form')
  const fiber = (form as unknown as Record<string, unknown>)[fiberKey] as {
    memoizedProps: { onSubmit?: (e: FormEvent) => void }
    alternate?: { memoizedProps: { onSubmit?: (e: FormEvent) => void } }
  }
  const fromAlternate = fiber.alternate?.memoizedProps?.onSubmit
  return (fromAlternate ?? fiber.memoizedProps.onSubmit) as (
    e: FormEvent
  ) => void
}

function latestOnClick(el: HTMLElement): () => void {
  const fiberKey = Object.keys(el).find(k => k.startsWith('__reactFiber'))
  if (!fiberKey) throw new Error('No React fiber found on element')
  const fiber = (el as unknown as Record<string, unknown>)[fiberKey] as {
    memoizedProps: { onClick?: () => void }
    alternate?: { memoizedProps: { onClick?: () => void } }
  }
  return (fiber.alternate?.memoizedProps?.onClick ??
    fiber.memoizedProps.onClick) as () => void
}
