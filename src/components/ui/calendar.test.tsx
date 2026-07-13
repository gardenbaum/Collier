import * as React from 'react'
import type { ComponentProps } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * These tests cover the Calendar primitive declared in
 * src/components/ui/calendar.tsx (currently 0% coverage, 220 lines,
 * 2 named exports: Calendar, CalendarDayButton).
 *
 * Calendar wraps react-day-picker's DayPicker with a fixed cn()
 * classNames map, four custom components (Root, Chevron, DayButton,
 * WeekNumber), and a default formatMonthDropdown formatter.
 * CalendarDayButton is the DayButton override DayPicker hands each
 * day cell — it focuses its ref when modifiers.focused flips true
 * and renders a Button with data-* selectors for selected / range
 * states.
 *
 * The react-day-picker mock captures the props DayPicker would have
 * received on `window.__lastDayPickerProps` so individual tests can
 * pull out the components map and exercise the in-tree Root /
 * Chevron / WeekNumber closures directly with synthetic props.
 */
const lastDayPickerPropsKey = '__lastDayPickerProps'

vi.mock('react-day-picker', () => {
  const DayPicker = (props: Record<string, unknown>) => {
    ;(window as unknown as Record<string, unknown>)[lastDayPickerPropsKey] =
      props
    return React.createElement('div', { 'data-rdp-mock': 'DayPicker' })
  }
  DayPicker.displayName = 'DayPicker'
  // The real getDefaultClassNames returns an object whose keys mirror
  // every classNames slot in DayPicker; each value is a `rdp-<key>`
  // marker string. The source does `cn('base', defaultClassNames.day,
  // className)` (and similar for every slot), so the marker MUST land
  // on the rendered class list — we use a single shared sentinel so
  // tests can `toContain('rdp-default')` without enumerating every
  // slot key. Calendar.tsx accesses ~25 slots, CalendarDayButton
  // accesses `defaultClassNames.day`.
  const defaults: Record<string, string> = {}
  for (const slot of [
    'root',
    'months',
    'month',
    'nav',
    'button_previous',
    'button_next',
    'month_caption',
    'dropdowns',
    'dropdown_root',
    'dropdown',
    'caption_label',
    'weekdays',
    'weekday',
    'week',
    'week_number_header',
    'week_number',
    'day',
    'range_start',
    'range_middle',
    'range_end',
    'today',
    'outside',
    'disabled',
    'hidden',
  ]) {
    defaults[slot] = 'rdp-default'
  }
  return {
    DayPicker,
    getDefaultClassNames: () => defaults,
  }
})

import { Calendar, CalendarDayButton } from './calendar'

const getCapturedProps = (): Record<string, unknown> => {
  const props = (window as unknown as Record<string, unknown>)[
    lastDayPickerPropsKey
  ] as Record<string, unknown> | undefined
  if (!props) throw new Error('DayPicker mock was never called')
  return props
}

interface CapturedComponents {
  Root: React.ComponentType<
    ComponentProps<'div'> & { rootRef?: React.Ref<HTMLDivElement> }
  >
  Chevron: React.ComponentType<{
    className?: string
    orientation?: 'left' | 'right' | 'up' | 'down' | undefined
  }>
  DayButton: React.ComponentType
  WeekNumber: React.ComponentType<ComponentProps<'td'>>
  [key: string]: unknown
}

const getCapturedComponents = (): CapturedComponents => {
  const components = getCapturedProps().components as
    | CapturedComponents
    | undefined
  if (!components) {
    throw new Error('Calendar did not forward a components map to DayPicker')
  }
  return components
}

describe('Calendar wrapper', () => {
  it('renders the DayPicker with default className merge and defaults', () => {
    render(<Calendar data-testid="day-picker-mock" />)

    // showOutsideDays + captionLayout are passed straight through to
    // DayPicker — assert on the captured props.
    expect(getCapturedProps().showOutsideDays).toBe(true)
    expect(getCapturedProps().captionLayout).toBe('label')

    // buttonVariant is NOT forwarded to DayPicker — the source
    // destructures it and only uses it inside the classNames object
    // (for button_previous / button_next). It must therefore be
    // absent from the captured props (so the source does not leak
    // it through `{...props}` either).
    expect(getCapturedProps().buttonVariant).toBeUndefined()

    const className = (getCapturedProps().className as string) ?? ''
    expect(className).toContain('group/calendar')
    expect(className).toContain('p-3')
    expect(className).toContain('[--cell-size:--spacing(8)]')
    expect(className).toContain('bg-[color:var(--background)]')
    expect(className).toContain('rtl:**:[.rdp-button\\_next>svg]:rotate-180')
    expect(className).toContain(
      'rtl:**:[.rdp-button\\_previous>svg]:rotate-180'
    )
  })

  it('appends the user className to the cn() base on Calendar', () => {
    render(
      <Calendar
        className="extra-calendar-class"
        data-testid="day-picker-mock"
      />
    )

    const className = (getCapturedProps().className as string) ?? ''
    expect(className).toContain('group/calendar')
    expect(className).toContain('extra-calendar-class')
  })

  it('forwards showOutsideDays + captionLayout onto DayPicker', () => {
    render(
      <Calendar
        showOutsideDays={false}
        captionLayout="dropdown"
        data-testid="day-picker-mock"
      />
    )

    expect(getCapturedProps().showOutsideDays).toBe(false)
    expect(getCapturedProps().captionLayout).toBe('dropdown')
    // buttonVariant is consumed by the source and not forwarded to
    // DayPicker (see the comment in the previous test).
    expect(getCapturedProps().buttonVariant).toBeUndefined()
  })
})

describe('Calendar classNames spread', () => {
  it('forwards a classNames object with every documented slot', () => {
    render(<Calendar data-testid="day-picker-mock" />)

    const classNames = getCapturedProps().classNames as
      | Record<string, string>
      | undefined
    expect(classNames).toBeDefined()
    const expectedSlots = [
      'root',
      'months',
      'month',
      'nav',
      'button_previous',
      'button_next',
      'month_caption',
      'dropdowns',
      'dropdown_root',
      'dropdown',
      'caption_label',
      'weekdays',
      'weekday',
      'week',
      'week_number_header',
      'week_number',
      'day',
      'range_start',
      'range_middle',
      'range_end',
      'today',
      'outside',
      'disabled',
      'hidden',
    ]
    for (const slot of expectedSlots) {
      const value = classNames?.[slot]
      expect(value, `slot ${slot} must be present on DayPicker`).toBeTruthy()
      expect(value).toContain('rdp-default')
    }
  })

  it('caption_label uses text-sm when captionLayout is label', () => {
    render(<Calendar captionLayout="label" data-testid="day-picker-mock" />)
    const classNames = getCapturedProps().classNames as Record<string, string>
    const caption = classNames.caption_label
    expect(caption).toContain('select-none')
    expect(caption).toContain('font-medium')
    expect(caption).toContain('text-sm')
    expect(caption).not.toContain('pl-2')
    expect(caption).not.toContain('h-8')
  })

  it('caption_label uses the dropdown tokens when captionLayout is not label', () => {
    render(<Calendar captionLayout="dropdown" data-testid="day-picker-mock" />)
    const classNames = getCapturedProps().classNames as Record<string, string>
    const caption = classNames.caption_label
    expect(caption).toContain('pl-2')
    expect(caption).toContain('pr-1')
    expect(caption).toContain('flex')
    expect(caption).toContain('items-center')
    expect(caption).toContain('gap-1')
    expect(caption).toContain('h-8')
    expect(caption).toContain('[&>svg]:text-[color:var(--muted-foreground)]')
    expect(caption).toContain('[&>svg]:size-3.5')
  })

  it('button_previous + button_next carry the cva(buttonVariant) base + always-on sizing', () => {
    render(<Calendar buttonVariant="secondary" data-testid="day-picker-mock" />)
    const classNames = getCapturedProps().classNames as Record<string, string>
    for (const slot of ['button_previous', 'button_next']) {
      const value = classNames[slot]
      expect(value).toContain('size-(--cell-size)')
      expect(value).toContain('aria-disabled:opacity-50')
      expect(value).toContain('p-0')
      expect(value).toContain('select-none')
    }
  })

  it('honours a user-provided classNames override on top of the cn() base', () => {
    render(
      <Calendar
        classNames={{ root: 'my-custom-root' }}
        data-testid="day-picker-mock"
      />
    )
    const classNames = getCapturedProps().classNames as Record<string, string>
    // The source spreads `...classNames` AFTER the cn() defaults, so a
    // user-supplied `root` key REPLACES the default `root` value.
    expect(classNames.root).toBe('my-custom-root')
    // Other slots must still carry the cn() defaults + the rdp-default
    // token from getDefaultClassNames().
    expect(classNames.month_caption).toContain('flex')
    expect(classNames.month_caption).toContain('rdp-default')
  })
})

describe('Calendar custom components', () => {
  it('forwards the four custom components (Root, Chevron, DayButton, WeekNumber)', () => {
    render(<Calendar data-testid="day-picker-mock" />)
    const components = getCapturedComponents()
    expect(components.Root).toBeDefined()
    expect(components.Chevron).toBeDefined()
    expect(components.DayButton).toBeDefined()
    expect(components.WeekNumber).toBeDefined()
    expect(components.DayButton).toBe(CalendarDayButton)
  })

  it('honours a user-provided component override on Root + DayButton', () => {
    const CustomRoot = (
      props: ComponentProps<'div'> & { rootRef?: React.Ref<HTMLDivElement> }
    ) => <div {...props} />
    const CustomDayButton = () => <button type="button" />

    render(
      <Calendar
        components={{ Root: CustomRoot, DayButton: CustomDayButton }}
        data-testid="day-picker-mock"
      />
    )
    const components = getCapturedComponents()
    expect(components.Root).toBe(CustomRoot)
    expect(components.DayButton).toBe(CustomDayButton)
    expect(components.Chevron).toBeDefined()
    expect(components.WeekNumber).toBeDefined()
  })

  describe('Root component (closure)', () => {
    it('renders a div with data-slot=calendar and forwards ref + props', () => {
      render(<Calendar data-testid="day-picker-mock" />)
      const { Root } = getCapturedComponents()
      const refCallback = vi.fn()

      const { container } = render(
        <Root
          rootRef={refCallback as unknown as React.Ref<HTMLDivElement>}
          className="extra-root-class"
          id="root-id"
          data-extra="extra"
        />
      )

      const root = container.querySelector('div') as HTMLDivElement
      expect(root).toHaveAttribute('data-slot', 'calendar')
      expect(root).toHaveClass('extra-root-class')
      expect(root).toHaveAttribute('id', 'root-id')
      expect(root).toHaveAttribute('data-extra', 'extra')
      expect(refCallback).toHaveBeenCalled()
    })

    it('Root forwards an object ref via .current', () => {
      render(<Calendar data-testid="day-picker-mock" />)
      const { Root } = getCapturedComponents()
      const refBag: { current: HTMLDivElement | null } = { current: null }

      const { container } = render(
        <Root rootRef={refBag as unknown as React.Ref<HTMLDivElement>} />
      )

      const root = container.querySelector('div') as HTMLDivElement
      // The closure receives `rootRef` and passes it through to the
      // inner <div ref={rootRef} ... />. React assigns the node to
      // the ref object on mount.
      expect(root).toHaveAttribute('data-slot', 'calendar')
      expect(refBag.current).toBe(root)
    })
  })

  describe('Chevron component (closure)', () => {
    it.each([
      ['left', 'lucide-chevron-left'],
      ['right', 'lucide-chevron-right'],
      ['down', 'lucide-chevron-down'],
    ])(
      'renders the matching icon when orientation is %s',
      (orientation, lucidePrefix) => {
        render(<Calendar data-testid="day-picker-mock" />)
        const { Chevron } = getCapturedComponents()
        const { container } = render(
          <Chevron
            className="extra-chevron"
            orientation={
              orientation as 'left' | 'right' | 'up' | 'down' | undefined
            }
          />
        )

        const svg = container.querySelector('svg') as SVGElement
        expect(svg).not.toBeNull()
        const cls = svg.getAttribute('class') ?? ''
        expect(cls).toContain(lucidePrefix)
        expect(cls).toContain('size-4')
        expect(cls).toContain('extra-chevron')
      }
    )

    it('Chevron with orientation=undefined falls through to the default (down) icon', () => {
      render(<Calendar data-testid="day-picker-mock" />)
      const { Chevron } = getCapturedComponents()
      const { container } = render(<Chevron />)
      const svg = container.querySelector('svg') as SVGElement
      const cls = svg.getAttribute('class') ?? ''
      expect(cls).toContain('lucide-chevron-down')
    })

    it('Chevron forwards arbitrary props onto the icon svg', () => {
      render(<Calendar data-testid="day-picker-mock" />)
      const { Chevron } = getCapturedComponents()
      const { container } = render(
        <Chevron
          orientation="left"
          data-testid="chevron-icon"
          aria-hidden="true"
        />
      )
      const svg = container.querySelector('svg') as SVGElement
      expect(svg).toHaveAttribute('data-testid', 'chevron-icon')
      expect(svg).toHaveAttribute('aria-hidden', 'true')
    })
  })

  describe('WeekNumber component (closure)', () => {
    it('renders a td wrapping a flex-centered div with the children', () => {
      render(<Calendar data-testid="day-picker-mock" />)
      const { WeekNumber } = getCapturedComponents()
      const { container } = render(
        <table>
          <tbody>
            <tr>
              <WeekNumber>42</WeekNumber>
            </tr>
          </tbody>
        </table>
      )
      const td = container.querySelector('td') as HTMLTableCellElement
      expect(td).not.toBeNull()
      const innerDiv = td.querySelector('div') as HTMLDivElement
      expect(innerDiv).toHaveClass('flex')
      expect(innerDiv).toHaveClass('size-(--cell-size)')
      expect(innerDiv).toHaveClass('items-center')
      expect(innerDiv).toHaveClass('justify-center')
      expect(innerDiv).toHaveClass('text-center')
      expect(innerDiv).toHaveTextContent('42')
    })

    it('WeekNumber forwards arbitrary td props onto the td', () => {
      render(<Calendar data-testid="day-picker-mock" />)
      const { WeekNumber } = getCapturedComponents()
      const { container } = render(
        <table>
          <tbody>
            <tr>
              <WeekNumber className="extra-week-class" id="week-id">
                7
              </WeekNumber>
            </tr>
          </tbody>
        </table>
      )
      const td = container.querySelector('td') as HTMLTableCellElement
      expect(td).toHaveClass('extra-week-class')
      expect(td).toHaveAttribute('id', 'week-id')
    })
  })
})

describe('Calendar formatters spread', () => {
  it('provides the default formatMonthDropdown when no user override is supplied', () => {
    render(<Calendar data-testid="day-picker-mock" />)

    const formatters = getCapturedProps().formatters as Record<string, unknown>
    expect(typeof formatters.formatMonthDropdown).toBe('function')

    const fmt = formatters.formatMonthDropdown as (d: Date) => string
    const out = fmt(new Date('2026-07-13T00:00:00.000Z'))
    expect(typeof out).toBe('string')
    expect(out.length).toBeGreaterThan(0)
  })

  it('honours a user-supplied formatMonthDropdown override', () => {
    const userFormatter = vi.fn(() => 'USER-MONTH')
    render(
      <Calendar
        formatters={{ formatMonthDropdown: userFormatter }}
        data-testid="day-picker-mock"
      />
    )
    const formatters = getCapturedProps().formatters as Record<string, unknown>
    expect(formatters.formatMonthDropdown).toBe(userFormatter)
  })

  it('keeps the other user-supplied formatter keys alongside the default', () => {
    const userFoo = vi.fn(() => 'FOO')
    render(
      <Calendar
        formatters={
          { formatWeekdayName: userFoo } as unknown as Record<string, unknown>
        }
        data-testid="day-picker-mock"
      />
    )
    const formatters = getCapturedProps().formatters as Record<string, unknown>
    expect(formatters.formatWeekdayName).toBe(userFoo)
    expect(typeof formatters.formatMonthDropdown).toBe('function')
  })
})

describe('Calendar misc', () => {
  it('forwards arbitrary props onto DayPicker', () => {
    render(
      <Calendar
        data-testid="day-picker-mock"
        // numberOfMonths is a real DayPicker prop the source accepts
        // via ComponentProps passthrough.
        numberOfMonths={2}
      />
    )

    expect(getCapturedProps().numberOfMonths).toBe(2)
  })
})

describe('CalendarDayButton', () => {
  let focusSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    focusSpy = vi.spyOn(HTMLButtonElement.prototype, 'focus')
  })

  afterEach(() => {
    focusSpy.mockRestore()
  })

  it('renders a Button with the variant=ghost + size=icon classes', () => {
    render(
      <CalendarDayButton
        day={{ date: new Date('2026-07-13T00:00:00Z') } as never}
        modifiers={{} as never}
        data-testid="cal-day-button"
      />
    )

    const btn = screen.getByTestId('cal-day-button')
    expect(btn.tagName).toBe('BUTTON')
    // Button does NOT emit data-variant / data-size as DOM attributes
    // (those props are consumed by the cva call). The variant=ghost +
    // size=icon tokens land on the className, but tailwind-merge in
    // cn() lets the CalendarDayButton source's `size-auto` win over
    // Button's `size-9`. So we assert on the survivor tokens.
    expect(btn).toHaveClass('bg-transparent') // ghost base
    expect(btn).toHaveClass('text-[color:var(--foreground)]') // ghost base
    expect(btn).toHaveClass('size-auto') // source's cell-size override
    expect(btn).toHaveAttribute('data-slot', 'button')
  })

  it('attaches the formatted data-day attribute from day.date.toLocaleDateString()', () => {
    const day = { date: new Date('2026-07-13T00:00:00.000Z') }
    render(
      <CalendarDayButton
        day={day as never}
        modifiers={{} as never}
        data-testid="cal-day-button"
      />
    )

    const btn = screen.getByTestId('cal-day-button')
    const dayAttr = btn.getAttribute('data-day') ?? ''
    expect(dayAttr.length).toBeGreaterThan(0)
    expect(dayAttr).toContain('2026')
  })

  it('sets data-selected-single only when modifiers.selected and not a range cell', () => {
    render(
      <CalendarDayButton
        day={{ date: new Date('2026-07-13T00:00:00Z') } as never}
        modifiers={{ selected: true } as never}
        data-testid="cal-day-button"
      />
    )
    expect(screen.getByTestId('cal-day-button')).toHaveAttribute(
      'data-selected-single',
      'true'
    )
  })

  it('does NOT set data-selected-single when the cell is a range start', () => {
    render(
      <CalendarDayButton
        day={{ date: new Date('2026-07-13T00:00:00Z') } as never}
        modifiers={{ selected: true, range_start: true } as unknown as never}
        data-testid="cal-day-button"
      />
    )
    const btn = screen.getByTestId('cal-day-button')
    expect(btn).toHaveAttribute('data-selected-single', 'false')
    expect(btn).toHaveAttribute('data-range-start', 'true')
  })

  it('does NOT set data-selected-single when the cell is a range middle', () => {
    render(
      <CalendarDayButton
        day={{ date: new Date('2026-07-13T00:00:00Z') } as never}
        modifiers={{ selected: true, range_middle: true } as unknown as never}
        data-testid="cal-day-button"
      />
    )
    const btn = screen.getByTestId('cal-day-button')
    expect(btn).toHaveAttribute('data-selected-single', 'false')
    expect(btn).toHaveAttribute('data-range-middle', 'true')
  })

  it('does NOT set data-selected-single when the cell is a range end', () => {
    render(
      <CalendarDayButton
        day={{ date: new Date('2026-07-13T00:00:00Z') } as never}
        modifiers={{ selected: true, range_end: true } as unknown as never}
        data-testid="cal-day-button"
      />
    )
    const btn = screen.getByTestId('cal-day-button')
    expect(btn).toHaveAttribute('data-selected-single', 'false')
    expect(btn).toHaveAttribute('data-range-end', 'true')
  })

  it('does NOT set data-selected-single when modifiers.selected is absent', () => {
    render(
      <CalendarDayButton
        day={{ date: new Date('2026-07-13T00:00:00Z') } as never}
        modifiers={{} as never}
        data-testid="cal-day-button"
      />
    )
    // When modifiers.selected is undefined, the source computes
    // `undefined && !range_start && !range_end && !range_middle` =
    // undefined. React strips undefined-valued attributes from the
    // rendered DOM, so the attribute must be absent.
    expect(screen.getByTestId('cal-day-button')).not.toHaveAttribute(
      'data-selected-single'
    )
    expect(screen.getByTestId('cal-day-button')).not.toHaveAttribute(
      'data-range-start'
    )
    expect(screen.getByTestId('cal-day-button')).not.toHaveAttribute(
      'data-range-middle'
    )
    expect(screen.getByTestId('cal-day-button')).not.toHaveAttribute(
      'data-range-end'
    )
  })

  it('focuses the button ref when modifiers.focused flips true', () => {
    const { rerender } = render(
      <CalendarDayButton
        day={{ date: new Date('2026-07-13T00:00:00Z') } as never}
        modifiers={{ focused: false } as never}
        data-testid="cal-day-button"
      />
    )

    expect(focusSpy).not.toHaveBeenCalled()

    rerender(
      <CalendarDayButton
        day={{ date: new Date('2026-07-13T00:00:00Z') } as never}
        modifiers={{ focused: true } as never}
        data-testid="cal-day-button"
      />
    )

    expect(focusSpy).toHaveBeenCalledTimes(1)
  })

  it('does NOT focus when modifiers.focused is undefined', () => {
    render(
      <CalendarDayButton
        day={{ date: new Date('2026-07-13T00:00:00Z') } as never}
        modifiers={{} as never}
        data-testid="cal-day-button"
      />
    )
    expect(focusSpy).not.toHaveBeenCalled()
  })

  it('appends user className to the cn() base', () => {
    render(
      <CalendarDayButton
        className="extra-day-class"
        day={{ date: new Date('2026-07-13T00:00:00Z') } as never}
        modifiers={{} as never}
        data-testid="cal-day-button"
      />
    )
    const btn = screen.getByTestId('cal-day-button')
    expect(btn).toHaveClass('extra-day-class')
    expect(btn).toHaveClass('rdp-default')
  })

  it('forwards arbitrary Button props (id, aria-*, data-*, onClick)', () => {
    const handleClick = vi.fn()
    render(
      <CalendarDayButton
        day={{ date: new Date('2026-07-13T00:00:00Z') } as never}
        modifiers={{} as never}
        data-testid="cal-day-button"
        id="cal-day-13"
        aria-label="Choose Monday"
        data-custom="custom-value"
        onClick={handleClick}
      />
    )
    const btn = screen.getByTestId('cal-day-button')
    expect(btn).toHaveAttribute('id', 'cal-day-13')
    expect(btn).toHaveAttribute('aria-label', 'Choose Monday')
    expect(btn).toHaveAttribute('data-custom', 'custom-value')

    fireEvent.click(btn)
    expect(handleClick).toHaveBeenCalledTimes(1)
  })
})
