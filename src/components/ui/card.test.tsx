import { render, screen } from '@testing-library/react'
import type { ComponentProps, ComponentType } from 'react'
import { describe, it, expect, vi } from 'vitest'

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from './card'

type CardWrapper = ComponentType<ComponentProps<'div'>>

interface CardWrapperSpec {
  Component: CardWrapper
  baseClasses: string[]
  name: string
  slot: string
}

const wrappers: CardWrapperSpec[] = [
  {
    Component: Card,
    baseClasses: ['bg-[color:var(--card)]', 'border', 'shadow-sm'],
    name: 'Card',
    slot: 'card',
  },
  {
    Component: CardHeader,
    baseClasses: ['grid', 'auto-rows-min', 'px-6'],
    name: 'CardHeader',
    slot: 'card-header',
  },
  {
    Component: CardTitle,
    baseClasses: ['leading-none', 'font-semibold'],
    name: 'CardTitle',
    slot: 'card-title',
  },
  {
    Component: CardDescription,
    baseClasses: ['text-[color:var(--muted-foreground)]', 'text-sm'],
    name: 'CardDescription',
    slot: 'card-description',
  },
  {
    Component: CardAction,
    baseClasses: ['col-start-2', 'row-span-2', 'justify-self-end'],
    name: 'CardAction',
    slot: 'card-action',
  },
  {
    Component: CardContent,
    baseClasses: ['px-6'],
    name: 'CardContent',
    slot: 'card-content',
  },
  {
    Component: CardFooter,
    baseClasses: ['flex', 'items-center', 'px-6'],
    name: 'CardFooter',
    slot: 'card-footer',
  },
]

/**
 * These tests cover the seven thin Card display wrappers declared in
 * src/components/ui/card.tsx. Each wrapper is a plain <div> that adds a
 * stable data-slot, merges Tailwind utility classes through cn(), and
 * forwards all remaining div props unchanged.
 */
describe('Card wrappers', () => {
  it.each(wrappers)(
    '$name renders a single div with slot metadata, classes, and forwarded props',
    ({ Component, baseClasses, name, slot }) => {
      const handleClick = vi.fn()
      const { container } = render(
        <Component
          aria-label={`${name} label`}
          className="custom-card-test-class"
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
      expect(element).toHaveClass('custom-card-test-class')

      element.click()
      expect(handleClick).toHaveBeenCalledTimes(1)
    }
  )
})
