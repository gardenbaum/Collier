/**
 * Tests for the `IssuePriorityField` component.
 *
 * The field is a tiny pure controlled component - a radiogroup of 5
 * buttons (P0..P4) that fires `onChange(value)` on click. The contract
 * worth pinning down here is:
 *
 *   1. Rendering: exactly 5 buttons render with the right `role`,
 *      `data-testid`, and the radiogroup carries the supplied
 *      `aria-label`.
 *   2. Selection state: `aria-checked` mirrors `value` exactly - one
 *      button `true`, the other four `false`, regardless of which
 *      priority is selected.
 *   3. Class wiring: selected vs unselected buttons pick up the right
 *      className prop without mixing them up.
 *   4. Click identity: every button click calls `onChange` once, with
 *      a value typed as `IssuePriority` and matching its own label.
 *
 * No mocks are needed beyond a `vi.fn` for `onChange` - the component
 * is pure (no i18n, no Tauri bindings, no global state).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import type { IssuePriority } from '@/lib/bindings'
import { IssuePriorityField } from './IssuePriorityField'

const PRIORITIES: IssuePriority[] = ['P0', 'P1', 'P2', 'P3', 'P4']

const defaultProps = {
  value: 'P2' as IssuePriority,
  onChange: vi.fn(),
  testIdPrefix: 'create-priority',
  ariaLabel: 'Priority',
  buttonClassName: 'btn-unselected',
  buttonSelectedClassName: 'btn-selected',
}

describe('IssuePriorityField', () => {
  describe('rendering', () => {
    it('renders exactly 5 radio buttons (P0..P4)', () => {
      render(<IssuePriorityField {...defaultProps} />)
      for (const p of PRIORITIES) {
        expect(
          screen.getByTestId(`${defaultProps.testIdPrefix}-${p}`)
        ).toBeInTheDocument()
      }
    })

    it('renders each button with role="radio"', () => {
      render(<IssuePriorityField {...defaultProps} />)
      const radios = screen.getAllByRole('radio')
      expect(radios).toHaveLength(5)
    })

    it('renders the radiogroup with the supplied aria-label', () => {
      render(
        <IssuePriorityField {...defaultProps} ariaLabel="Issue Priority" />
      )
      expect(
        screen.getByRole('radiogroup', { name: 'Issue Priority' })
      ).toBeInTheDocument()
    })

    it('renders each button label as the priority string', () => {
      render(<IssuePriorityField {...defaultProps} />)
      for (const p of PRIORITIES) {
        expect(
          screen.getByTestId(`${defaultProps.testIdPrefix}-${p}`).textContent
        ).toBe(p)
      }
    })
  })

  describe('selection state (aria-checked)', () => {
    it('with value=P2 marks exactly the P2 button aria-checked=true', () => {
      render(<IssuePriorityField {...defaultProps} value="P2" />)
      const checked = screen.getAllByRole('radio', { checked: true })
      expect(checked).toHaveLength(1)
      expect(checked[0]).toBe(screen.getByTestId('create-priority-P2'))

      const unchecked = screen.getAllByRole('radio', { checked: false })
      expect(unchecked).toHaveLength(4)
    })

    it('with value=P0 marks P0 aria-checked=true and the others false', () => {
      render(<IssuePriorityField {...defaultProps} value="P0" />)
      expect(screen.getByTestId('create-priority-P0')).toHaveAttribute(
        'aria-checked',
        'true'
      )
      for (const p of ['P1', 'P2', 'P3', 'P4'] as const) {
        expect(screen.getByTestId(`create-priority-${p}`)).toHaveAttribute(
          'aria-checked',
          'false'
        )
      }
    })

    it('with value=P4 marks P4 aria-checked=true and the others false', () => {
      render(<IssuePriorityField {...defaultProps} value="P4" />)
      expect(screen.getByTestId('create-priority-P4')).toHaveAttribute(
        'aria-checked',
        'true'
      )
      for (const p of ['P0', 'P1', 'P2', 'P3'] as const) {
        expect(screen.getByTestId(`create-priority-${p}`)).toHaveAttribute(
          'aria-checked',
          'false'
        )
      }
    })
  })

  describe('class wiring (selected vs unselected)', () => {
    it('applies buttonSelectedClassName to the selected button only', () => {
      const { container } = render(
        <IssuePriorityField {...defaultProps} value="P1" />
      )
      const selected = screen.getByTestId('create-priority-P1')
      expect(selected.className).toContain('btn-selected')
      expect(selected.className).not.toContain('btn-unselected')

      for (const p of ['P0', 'P2', 'P3', 'P4'] as const) {
        const btn = screen.getByTestId(`create-priority-${p}`)
        expect(btn.className).toContain('btn-unselected')
        expect(btn.className).not.toContain('btn-selected')
      }
      // Sanity: the wrapping radiogroup was rendered (container has the role).
      expect(container.querySelector('[role="radiogroup"]')).not.toBeNull()
    })

    it('honours alternate className props for selected/unselected', () => {
      render(
        <IssuePriorityField
          {...defaultProps}
          value="P3"
          buttonClassName="pill-off"
          buttonSelectedClassName="pill-on"
        />
      )
      const selected = screen.getByTestId('create-priority-P3')
      expect(selected.className).toContain('pill-on')
      expect(selected.className).not.toContain('pill-off')

      const other = screen.getByTestId('create-priority-P0')
      expect(other.className).toContain('pill-off')
      expect(other.className).not.toContain('pill-on')
    })
  })

  describe('click handlers', () => {
    it('clicking the P3 button fires onChange with "P3"', () => {
      const onChange = vi.fn()
      render(
        <IssuePriorityField {...defaultProps} value="P2" onChange={onChange} />
      )
      fireEvent.click(screen.getByTestId('create-priority-P3'))
      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange).toHaveBeenCalledWith('P3')
    })

    it.each(PRIORITIES)(
      'clicking the %s button fires onChange("%s") exactly once',
      p => {
        const onChange = vi.fn()
        render(
          <IssuePriorityField
            {...defaultProps}
            value="P2"
            onChange={onChange}
          />
        )
        fireEvent.click(screen.getByTestId(`${defaultProps.testIdPrefix}-${p}`))
        expect(onChange).toHaveBeenCalledTimes(1)
        expect(onChange).toHaveBeenCalledWith(p)
      }
    )

    it('clicking the currently-selected button still fires onChange (uncontrolled-style)', () => {
      const onChange = vi.fn()
      render(
        <IssuePriorityField {...defaultProps} value="P2" onChange={onChange} />
      )
      fireEvent.click(screen.getByTestId('create-priority-P2'))
      expect(onChange).toHaveBeenCalledTimes(1)
      expect(onChange).toHaveBeenCalledWith('P2')
    })

    it('does not mutate parent state without a click', () => {
      const onChange = vi.fn()
      render(<IssuePriorityField {...defaultProps} onChange={onChange} />)
      expect(onChange).not.toHaveBeenCalled()
    })
  })

  describe('props pass-through (testIdPrefix / ariaLabel)', () => {
    it('uses a different testIdPrefix on every button', () => {
      render(
        <IssuePriorityField
          {...defaultProps}
          testIdPrefix="update-priority"
          ariaLabel="Update Priority"
        />
      )
      for (const p of PRIORITIES) {
        expect(screen.getByTestId(`update-priority-${p}`)).toBeInTheDocument()
        // Old prefix should not be present.
        expect(screen.queryByTestId(`create-priority-${p}`)).toBeNull()
      }
      expect(
        screen.getByRole('radiogroup', { name: 'Update Priority' })
      ).toBeInTheDocument()
    })

    it('radiogroup carries the ariaLabel prop verbatim', () => {
      render(<IssuePriorityField {...defaultProps} ariaLabel="🟢 Sev" />)
      expect(
        screen.getByRole('radiogroup', { name: '🟢 Sev' })
      ).toBeInTheDocument()
    })

    it('radiogroup carries the same ariaLabel even when only one button is re-rendered via prop change', () => {
      const { rerender } = render(
        <IssuePriorityField {...defaultProps} ariaLabel="First" />
      )
      expect(
        screen.getByRole('radiogroup', { name: 'First' })
      ).toBeInTheDocument()
      rerender(<IssuePriorityField {...defaultProps} ariaLabel="Second" />)
      expect(
        screen.getByRole('radiogroup', { name: 'Second' })
      ).toBeInTheDocument()
      expect(screen.queryByRole('radiogroup', { name: 'First' })).toBeNull()
    })
  })
})
