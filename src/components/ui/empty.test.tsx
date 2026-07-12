import { render, screen } from '@testing-library/react'
import type { ComponentProps, ComponentType } from 'react'
import { describe, it, expect, vi } from 'vitest'

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from './empty'

type EmptyWrapper = ComponentType<ComponentProps<'div'>>

interface EmptyWrapperSpec {
  Component: EmptyWrapper
  baseClasses: string[]
  name: string
  slot: string
}

/**
 * These tests cover the six thin Empty display wrappers declared in
 * src/components/ui/empty.tsx. Each wrapper is a plain <div> that adds
 * a stable data-slot, merges Tailwind utility classes through cn()
 * (or class-variance-authority for EmptyMedia), and forwards all
 * remaining div props unchanged.
 *
 * EmptyMedia is exercised separately because its styling is driven by
 * cva variants ('default' | 'icon') rather than a static cn() call —
 * the variant branch + data-variant propagation live in their own tests.
 */
const simpleWrappers: EmptyWrapperSpec[] = [
  {
    Component: Empty,
    baseClasses: [
      'flex',
      'min-w-0',
      'flex-1',
      'flex-col',
      'items-center',
      'justify-center',
      'gap-6',
      'rounded-[var(--radius)]',
      'border-dashed',
      'border-[color:var(--border)]',
      'p-6',
      'text-center',
      'text-balance',
      'md:p-12',
    ],
    name: 'Empty',
    slot: 'empty',
  },
  {
    Component: EmptyHeader,
    baseClasses: [
      'flex',
      'max-w-sm',
      'flex-col',
      'items-center',
      'gap-2',
      'text-center',
    ],
    name: 'EmptyHeader',
    slot: 'empty-header',
  },
  {
    Component: EmptyTitle,
    baseClasses: ['text-lg', 'font-medium', 'tracking-tight'],
    name: 'EmptyTitle',
    slot: 'empty-title',
  },
  {
    Component: EmptyDescription,
    baseClasses: [
      'text-[color:var(--muted-foreground)]',
      '[&>a:hover]:text-[color:var(--primary)]',
      'text-sm/relaxed',
      '[&>a]:underline',
      '[&>a]:underline-offset-4',
    ],
    name: 'EmptyDescription',
    slot: 'empty-description',
  },
  {
    Component: EmptyContent,
    baseClasses: [
      'flex',
      'w-full',
      'max-w-sm',
      'min-w-0',
      'flex-col',
      'items-center',
      'gap-4',
      'text-sm',
      'text-balance',
    ],
    name: 'EmptyContent',
    slot: 'empty-content',
  },
]

describe('Empty wrappers', () => {
  it.each(simpleWrappers)(
    '$name renders a single div with slot metadata, classes, and forwarded props',
    ({ Component, baseClasses, name, slot }) => {
      const handleClick = vi.fn()
      const { container } = render(
        <Component
          aria-label={`${name} label`}
          className="custom-empty-test-class"
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
      expect(element).toHaveClass('custom-empty-test-class')

      element.click()
      expect(handleClick).toHaveBeenCalledTimes(1)
    }
  )

  describe('EmptyMedia', () => {
    it('uses the data-slot "empty-icon" and applies the default variant when none is provided', () => {
      const { container } = render(
        <EmptyMedia data-testid="empty-media-default">
          <svg />
        </EmptyMedia>
      )

      const element = screen.getByTestId('empty-media-default')
      expect(container.children).toHaveLength(1)
      expect(element.tagName).toBe('DIV')
      // Note: the data-slot is "empty-icon" even though the exported name
      // is EmptyMedia — the shadcn empty.tsx template keeps the original
      // slot string for compatibility with their example markup.
      expect(element).toHaveAttribute('data-slot', 'empty-icon')
      expect(element).toHaveAttribute('data-variant', 'default')
      expect(element).toHaveClass('bg-transparent')
      // The cva base classes are always present.
      expect(element).toHaveClass('flex')
      expect(element).toHaveClass('shrink-0')
      expect(element).toHaveClass('mb-2')
      expect(element).toContainHTML('<svg')
    })

    it('renders the icon variant with the size-10 rounded background and propagates data-variant', () => {
      const { container } = render(
        <EmptyMedia data-testid="empty-media-icon" variant="icon">
          <svg />
        </EmptyMedia>
      )

      const element = screen.getByTestId('empty-media-icon')
      expect(container.children).toHaveLength(1)
      expect(element).toHaveAttribute('data-slot', 'empty-icon')
      expect(element).toHaveAttribute('data-variant', 'icon')
      // Icon-variant-specific classes from the cva definition.
      expect(element).toHaveClass('bg-[color:var(--muted)]')
      expect(element).toHaveClass('text-[color:var(--foreground)]')
      expect(element).toHaveClass('size-10')
      expect(element).toHaveClass('rounded-[var(--radius)]')
    })

    it('merges a custom className through the cva call', () => {
      const handleClick = vi.fn()
      render(
        <EmptyMedia
          aria-label="media label"
          className="custom-empty-media-class"
          data-testid="empty-media-custom"
          id="empty-media-id"
          onClick={handleClick}
          variant="icon"
        >
          <svg />
        </EmptyMedia>
      )

      const element = screen.getByTestId('empty-media-custom')
      expect(element).toHaveAttribute('id', 'empty-media-id')
      expect(element).toHaveAttribute('aria-label', 'media label')
      expect(element).toHaveAttribute('data-variant', 'icon')
      // Variant classes still applied alongside the custom class.
      expect(element).toHaveClass('size-10')
      expect(element).toHaveClass('custom-empty-media-class')

      element.click()
      expect(handleClick).toHaveBeenCalledTimes(1)
    })
  })
})
