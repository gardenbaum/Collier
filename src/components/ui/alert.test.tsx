import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps, ComponentType } from 'react'
import { describe, it, expect, vi } from 'vitest'

import { Alert, AlertDescription, AlertTitle } from './alert'

type AlertSimpleWrapper = ComponentType<ComponentProps<'div'>>

interface AlertSimpleWrapperSpec {
  Component: AlertSimpleWrapper
  baseClasses: string[]
  name: string
  slot: string
}

/**
 * These tests cover the three wrappers declared in
 * src/components/ui/alert.tsx.
 *
 * AlertTitle and AlertDescription are plain div wrappers whose styling
 * comes from a static `cn()` call — they share the same shape as the
 * Card / Empty wrappers and are exercised through a data-driven loop.
 *
 * Alert is handled separately because its className is driven by a
 * cva call (`default` | `destructive`) AND the component hardcodes a
 * `role="alert"` ARIA attribute. The variant branch + role attribute
 * + className merge live in their own tests.
 */
const simpleWrappers: AlertSimpleWrapperSpec[] = [
  {
    Component: AlertTitle,
    baseClasses: [
      'col-start-2',
      'line-clamp-1',
      'min-h-4',
      'font-medium',
      'tracking-tight',
    ],
    name: 'AlertTitle',
    slot: 'alert-title',
  },
  {
    Component: AlertDescription,
    baseClasses: [
      'text-[color:var(--muted-foreground)]',
      'col-start-2',
      'grid',
      'justify-items-start',
      'gap-1',
      'text-sm',
      '[&_p]:leading-relaxed',
    ],
    name: 'AlertDescription',
    slot: 'alert-description',
  },
]

describe('Alert wrappers', () => {
  it.each(simpleWrappers)(
    '$name renders a single div with slot metadata, classes, and forwarded props',
    ({ Component, baseClasses, name, slot }) => {
      const handleClick = vi.fn()
      const { container } = render(
        <Component
          aria-label={`${name} label`}
          className="custom-alert-test-class"
          data-custom="custom-value"
          data-testid={slot}
          id={`${slot}-id`}
          onClick={handleClick}
        >
          {name} content
        </Component>
      )

      const element = screen.getByTestId(slot)
      expect(container.children).toHaveLength(1)
      expect(element.tagName).toBe('DIV')
      expect(element).toHaveAttribute('data-slot', slot)
      expect(element).toHaveAttribute('id', `${slot}-id`)
      expect(element).toHaveAttribute('aria-label', `${name} label`)
      expect(element).toHaveAttribute('data-custom', 'custom-value')
      expect(element).toHaveTextContent(`${name} content`)

      for (const className of baseClasses) {
        expect(element).toHaveClass(className)
      }
      expect(element).toHaveClass('custom-alert-test-class')

      element.click()
      expect(handleClick).toHaveBeenCalledTimes(1)
    }
  )

  describe('Alert', () => {
    it('uses the data-slot "alert", sets role="alert", and applies the default variant when none is provided', () => {
      const { container } = render(
        <Alert data-testid="alert-default">
          <AlertTitle>Heads up</AlertTitle>
          <AlertDescription>Something happened.</AlertDescription>
        </Alert>
      )

      const element = screen.getByTestId('alert-default')
      expect(container.children).toHaveLength(1)
      expect(element.tagName).toBe('DIV')
      expect(element).toHaveAttribute('data-slot', 'alert')
      expect(element).toHaveAttribute('role', 'alert')
      // The cva base classes are always present regardless of variant.
      expect(element).toHaveClass('relative')
      expect(element).toHaveClass('w-full')
      expect(element).toHaveClass('rounded-[var(--radius)]')
      expect(element).toHaveClass('border')
      expect(element).toHaveClass('px-4')
      expect(element).toHaveClass('py-3')
      expect(element).toHaveClass('text-sm')
      expect(element).toHaveClass('grid')
      // Default-variant classes from the cva definition.
      expect(element).toHaveClass('bg-[color:var(--card)]')
      expect(element).toHaveClass('text-[color:var(--card-foreground)]')
      // Children are forwarded unchanged.
      expect(element).toContainElement(screen.getByText('Heads up'))
      expect(element).toContainElement(screen.getByText('Something happened.'))
    })

    it('renders the destructive variant with destructive text colour and the nested alert-description selector', () => {
      render(
        <Alert data-testid="alert-destructive" variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Something went wrong.</AlertDescription>
        </Alert>
      )

      const element = screen.getByTestId('alert-destructive')
      expect(element).toHaveAttribute('data-slot', 'alert')
      expect(element).toHaveAttribute('role', 'alert')
      // Destructive-variant classes from the cva definition.
      expect(element).toHaveClass('text-[color:var(--destructive)]')
      expect(element).toHaveClass('bg-[color:var(--card)]')
      // Child selector that re-styles nested AlertDescription text in
      // destructive context: `*:data-[slot=alert-description]:text-[color:var(--destructive)]/90`.
      expect(element).toHaveClass(
        '*:data-[slot=alert-description]:text-[color:var(--destructive)]/90'
      )
      // Children are still forwarded.
      expect(element).toContainElement(screen.getByText('Error'))
    })

    it('merges a custom className through the cva call alongside the default variant classes', () => {
      const handleClick = vi.fn()
      render(
        <Alert
          aria-label="alert label"
          className="custom-alert-class"
          data-custom="custom-value"
          data-testid="alert-custom"
          id="alert-id"
          onClick={handleClick}
        >
          Content
        </Alert>
      )

      const element = screen.getByTestId('alert-custom')
      expect(element).toHaveAttribute('id', 'alert-id')
      expect(element).toHaveAttribute('aria-label', 'alert label')
      expect(element).toHaveAttribute('data-custom', 'custom-value')
      expect(element).toHaveAttribute('role', 'alert')
      // Variant classes still applied alongside the custom class.
      expect(element).toHaveClass('bg-[color:var(--card)]')
      expect(element).toHaveClass('custom-alert-class')
      expect(element).toHaveTextContent('Content')

      element.click()
      expect(handleClick).toHaveBeenCalledTimes(1)
    })

    it('forwards additional ARIA / title attributes onto the rendered element', () => {
      const handleMouseEnter = vi.fn()
      render(
        <Alert
          aria-live="polite"
          data-testid="alert-forwarded"
          id="forwarded-alert"
          onMouseEnter={handleMouseEnter}
          title="tooltip text"
        />
      )

      const element = screen.getByTestId('alert-forwarded')
      expect(element).toHaveAttribute('id', 'forwarded-alert')
      expect(element).toHaveAttribute('aria-live', 'polite')
      expect(element).toHaveAttribute('title', 'tooltip text')

      // Use fireEvent so React's synthetic event system sees the
      // mouseenter — a raw dispatchEvent would skip the synthetic
      // dispatch path that the component's handler is wired through.
      fireEvent.mouseEnter(element)
      expect(handleMouseEnter).toHaveBeenCalledTimes(1)
    })
  })
})
