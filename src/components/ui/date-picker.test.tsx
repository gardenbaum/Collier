import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { DatePicker } from './date-picker'

interface MockCalendarProps {
  mode?: string
  selected?: Date
  captionLayout?: string
  onSelect?: (date: Date | undefined) => void
}

vi.mock('@/components/ui/calendar', () => ({
  Calendar: ({
    mode,
    selected,
    captionLayout,
    onSelect,
  }: MockCalendarProps) => (
    <div
      data-testid="calendar"
      data-mode={mode}
      data-selected={selected?.toISOString()}
      data-caption-layout={captionLayout}
    >
      <button
        type="button"
        onClick={() => onSelect?.(new Date('2026-08-24T12:00:00.000Z'))}
      >
        Select mocked date
      </button>
    </div>
  ),
}))

class ResizeObserverStub {
  observe(): void {
    /* no-op */
  }
  unobserve(): void {
    /* no-op */
  }
  disconnect(): void {
    /* no-op */
  }
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver
}

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {
    // no-op
  }
}

const openPicker = (triggerName: string | RegExp) => {
  fireEvent.click(screen.getByRole('button', { name: triggerName }))
  return screen.getByTestId('calendar')
}

describe('DatePicker', () => {
  it('renders the default placeholder and hides Clear when no value is set', () => {
    render(<DatePicker />)

    expect(
      screen.getByRole('button', { name: 'Select date' })
    ).toBeInTheDocument()

    openPicker('Select date')
    expect(
      screen.queryByRole('button', { name: 'Clear' })
    ).not.toBeInTheDocument()
  })

  it('renders a custom placeholder', () => {
    render(<DatePicker placeholder="Choose a due date" />)

    expect(
      screen.getByRole('button', { name: 'Choose a due date' })
    ).toBeInTheDocument()
  })

  it('renders the selected date, ChevronDownIcon, and trigger className', () => {
    const value = new Date('2026-07-13T12:00:00.000Z')
    render(<DatePicker value={value} className="date-trigger" />)

    const trigger = screen.getByRole('button', {
      name: value.toLocaleDateString(),
    })
    expect(trigger).toHaveClass(
      'w-full',
      'justify-between',
      'font-normal',
      'date-trigger'
    )
    expect(trigger.querySelector('svg.lucide-chevron-down')).toBeInTheDocument()
  })

  it('opens the Popover with a single-select Calendar configured from value', () => {
    const value = new Date('2026-07-13T12:00:00.000Z')
    render(<DatePicker value={value} />)

    expect(screen.queryByTestId('calendar')).not.toBeInTheDocument()
    const calendar = openPicker(value.toLocaleDateString())

    expect(calendar).toHaveAttribute('data-mode', 'single')
    expect(calendar).toHaveAttribute('data-selected', value.toISOString())
    expect(calendar).toHaveAttribute('data-caption-layout', 'dropdown')
  })

  it('clears the value through onChange and closes the Popover', () => {
    const value = new Date('2026-07-13T12:00:00.000Z')
    const onChange = vi.fn()
    render(<DatePicker value={value} onChange={onChange} />)

    openPicker(value.toLocaleDateString())
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))

    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith(undefined)
    expect(screen.queryByTestId('calendar')).not.toBeInTheDocument()
  })

  it('closes after Clear even when onChange is omitted', () => {
    const value = new Date('2026-07-13T12:00:00.000Z')
    render(<DatePicker value={value} />)

    openPicker(value.toLocaleDateString())
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))

    expect(screen.queryByTestId('calendar')).not.toBeInTheDocument()
  })

  it('passes a selected date to onChange and closes the Popover', () => {
    const onChange = vi.fn()
    render(<DatePicker onChange={onChange} />)

    openPicker('Select date')
    fireEvent.click(screen.getByRole('button', { name: 'Select mocked date' }))

    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith(new Date('2026-08-24T12:00:00.000Z'))
    expect(screen.queryByTestId('calendar')).not.toBeInTheDocument()
  })

  it('closes after date selection even when onChange is omitted', () => {
    render(<DatePicker />)

    openPicker('Select date')
    fireEvent.click(screen.getByRole('button', { name: 'Select mocked date' }))

    expect(screen.queryByTestId('calendar')).not.toBeInTheDocument()
  })
})
