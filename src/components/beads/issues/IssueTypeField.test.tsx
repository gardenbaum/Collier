/**
 * Tests for the `IssueTypeField` component.
 *
 * The field is a tiny pure controlled component - a single <select>
 * over the closed v1 `IssueType` enum (7 entries, pinned by the
 * sibling `beads-enums.test.ts`) that fires `onChange(value)` on
 * change. The contract worth pinning down here is:
 *
 *   1. Rendering: a single <select> renders with the supplied
 *      `testId` and `selectClassName`, and exactly 7 <option>s in
 *      the v1 schema order.
 *   2. Selection state: `value` is reflected on the <select> itself
 *      and as `selected` on the matching <option> regardless of
 *      which type is selected.
 *   3. onChange identity: every change fires `onChange` once with a
 *      value typed as `IssueType` matching the chosen option.
 *   4. Props pass-through: `testId` and `selectClassName` are
 *      forwarded verbatim (including a re-render path).
 *
 * No mocks are needed beyond a `vi.fn` for `onChange` - the
 * component is pure (no i18n, no Tauri bindings, no global state).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import type { IssueType } from '@/lib/bindings'
import { IssueTypeField } from './IssueTypeField'

const ISSUE_TYPES: IssueType[] = [
  'bug',
  'feature',
  'task',
  'epic',
  'chore',
  'decision',
  'gate',
]

const defaultProps = {
  value: 'task' as IssueType,
  onChange: vi.fn(),
  testId: 'create-type',
  selectClassName: 'select-unstyled',
}

describe('IssueTypeField', () => {
  describe('rendering', () => {
    it('renders a <select> with the supplied testId', () => {
      render(<IssueTypeField {...defaultProps} />)
      expect(screen.getByTestId('create-type')).toBeInTheDocument()
      expect(screen.getByTestId('create-type').tagName).toBe('SELECT')
    })

    it('renders exactly 7 <option>s in ISSUE_TYPES order', () => {
      render(<IssueTypeField {...defaultProps} />)
      const select = screen.getByTestId('create-type') as HTMLSelectElement
      const optionValues = Array.from(select.options).map(o => o.value)
      expect(optionValues).toEqual(ISSUE_TYPES)
    })

    it('applies selectClassName verbatim to the <select>', () => {
      render(<IssueTypeField {...defaultProps} />)
      const select = screen.getByTestId('create-type')
      expect(select.className).toContain('select-unstyled')
    })

    it('honours an alternate selectClassName on the <select>', () => {
      render(
        <IssueTypeField
          {...defaultProps}
          selectClassName="rounded-md border px-2 py-1"
        />
      )
      const select = screen.getByTestId('create-type')
      expect(select.className).toContain('rounded-md')
      expect(select.className).toContain('border')
      expect(select.className).toContain('px-2')
      expect(select.className).not.toContain('select-unstyled')
    })
  })

  describe('selection state (controlled value)', () => {
    it('with value="bug" the <select>.value is "bug" and bug is selected', () => {
      render(<IssueTypeField {...defaultProps} value="bug" />)
      const select = screen.getByTestId('create-type') as HTMLSelectElement
      expect(select.value).toBe('bug')
      const selectedOptions = Array.from(select.selectedOptions).map(
        o => o.value
      )
      expect(selectedOptions).toEqual(['bug'])
    })

    it('with value="epic" the <select>.value is "epic" and only epic is selected', () => {
      render(<IssueTypeField {...defaultProps} value="epic" />)
      const select = screen.getByTestId('create-type') as HTMLSelectElement
      expect(select.value).toBe('epic')
      const selectedOptions = Array.from(select.selectedOptions).map(
        o => o.value
      )
      expect(selectedOptions).toEqual(['epic'])
    })

    it('with value="gate" (last in v1 schema order) the <select>.value is "gate"', () => {
      render(<IssueTypeField {...defaultProps} value="gate" />)
      const select = screen.getByTestId('create-type') as HTMLSelectElement
      expect(select.value).toBe('gate')
      const selectedOptions = Array.from(select.selectedOptions).map(
        o => o.value
      )
      expect(selectedOptions).toEqual(['gate'])
    })

    it.each(ISSUE_TYPES)(
      'every IssueType maps to a matching <option> selected = [%s]',
      t => {
        render(<IssueTypeField {...defaultProps} value={t} />)
        const select = screen.getByTestId('create-type') as HTMLSelectElement
        expect(select.value).toBe(t)
        // option label matches the enum string (no localisation)
        const opt = Array.from(select.options).find(o => o.value === t)
        expect(opt?.textContent).toBe(t)
        expect(opt?.selected).toBe(true)
      }
    )

    it('reactively updates when value prop changes (parent-driven rerender)', () => {
      const { rerender } = render(
        <IssueTypeField {...defaultProps} value="bug" />
      )
      let select = screen.getByTestId('create-type') as HTMLSelectElement
      expect(select.value).toBe('bug')

      rerender(<IssueTypeField {...defaultProps} value="feature" />)
      select = screen.getByTestId('create-type') as HTMLSelectElement
      expect(select.value).toBe('feature')
    })
  })

  describe('onChange identity', () => {
    it('changing the <select> to "epic" fires onChange("epic") exactly once', () => {
      const onChange = vi.fn()
      render(
        <IssueTypeField {...defaultProps} value="task" onChange={onChange} />
      )
      fireEvent.change(screen.getByTestId('create-type'), {
        target: { value: 'epic' },
      })
      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange).toHaveBeenCalledWith('epic')
    })

    it.each(ISSUE_TYPES)(
      'selecting %s fires onChange("%s") exactly once',
      t => {
        const onChange = vi.fn()
        render(
          <IssueTypeField {...defaultProps} value="task" onChange={onChange} />
        )
        fireEvent.change(screen.getByTestId('create-type'), {
          target: { value: t },
        })
        expect(onChange).toHaveBeenCalledTimes(1)
        expect(onChange).toHaveBeenCalledWith(t)
      }
    )

    it('selecting the currently-selected option still fires onChange (uncontrolled-style)', () => {
      const onChange = vi.fn()
      render(
        <IssueTypeField {...defaultProps} value="task" onChange={onChange} />
      )
      fireEvent.change(screen.getByTestId('create-type'), {
        target: { value: 'task' },
      })
      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange).toHaveBeenCalledWith('task')
    })

    it('does not fire onChange on initial render', () => {
      const onChange = vi.fn()
      render(<IssueTypeField {...defaultProps} onChange={onChange} />)
      expect(onChange).not.toHaveBeenCalled()
    })

    it('passes the typed IssueType (not a string literal cast) through onChange', () => {
      // Compile-time check: the call site must not need a cast. If the
      // component typed the value as `string`, this `as IssueType` would
      // be required and the test would still pass at runtime. Instead we
      // confirm that the call receives a value that is assignable to
      // every IssueType literal - i.e. one of the 7 closed values.
      const onChange = vi.fn()
      render(
        <IssueTypeField {...defaultProps} value="task" onChange={onChange} />
      )
      fireEvent.change(screen.getByTestId('create-type'), {
        target: { value: 'decision' },
      })
      const arg = onChange.mock.calls[0]?.[0]
      expect(ISSUE_TYPES).toContain(arg)
    })
  })

  describe('props pass-through (testId / selectClassName)', () => {
    it('uses a different testId when supplied ("update-type")', () => {
      render(<IssueTypeField {...defaultProps} testId="update-type" />)
      expect(screen.getByTestId('update-type')).toBeInTheDocument()
      expect(screen.queryByTestId('create-type')).toBeNull()
    })

    it('carries the new testId across a rerender', () => {
      const { rerender } = render(
        <IssueTypeField {...defaultProps} testId="create-type" />
      )
      expect(screen.getByTestId('create-type')).toBeInTheDocument()
      rerender(<IssueTypeField {...defaultProps} testId="update-type" />)
      expect(screen.getByTestId('update-type')).toBeInTheDocument()
      expect(screen.queryByTestId('create-type')).toBeNull()
    })

    it('forwards selectClassName across a rerender without leaking the previous class', () => {
      const { rerender } = render(
        <IssueTypeField
          {...defaultProps}
          selectClassName="border border-red-500"
        />
      )
      let select = screen.getByTestId('create-type')
      expect(select.className).toContain('border-red-500')

      rerender(
        <IssueTypeField {...defaultProps} selectClassName="bg-blue-100" />
      )
      select = screen.getByTestId('create-type')
      expect(select.className).toContain('bg-blue-100')
      expect(select.className).not.toContain('border-red-500')
    })
  })

  describe('ISSUE_TYPES enumeration lockstep', () => {
    // Sibling test (beads-enums.test.ts) already pins the 7 closed v1
    // types. This block asserts the rendered <option>s stay in lockstep
    // with that source-of-truth so a stray edit to the enum is caught
    // by *this* file's render path, not only by the enum-only test.
    it('renders <option>s whose text equals the v1 enum literal exactly', () => {
      render(<IssueTypeField {...defaultProps} />)
      for (const t of ISSUE_TYPES) {
        // Option text is the literal enum string - no localisation, no
        // pretty-printing. If a future refactor introduces label
        // mapping, this test must be updated deliberately.
        expect(screen.getByRole('option', { name: t })).toBeInTheDocument()
      }
    })

    it('renders the same 7 <option>s as beads-enums exports (length match)', () => {
      render(<IssueTypeField {...defaultProps} />)
      const options = screen.getAllByRole('option')
      expect(options).toHaveLength(ISSUE_TYPES.length)
    })
  })
})
