'use client'

import * as React from 'react'
import * as TogglePrimitive from '@radix-ui/react-toggle'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const toggleVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius)] text-sm font-medium hover:bg-[color:var(--muted)] hover:text-[color:var(--muted-foreground)] disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-[color:var(--accent)] data-[state=on]:text-[color:var(--accent-foreground)] [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0 focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--background)] outline-none transition-[color,box-shadow] aria-invalid:ring-[color:var(--destructive)] aria-invalid:border-[color:var(--destructive)] whitespace-nowrap",
  {
    variants: {
      variant: {
        default: 'bg-transparent',
        outline:
          'border border-[color:var(--border)] bg-transparent shadow-xs hover:bg-[color:var(--accent)]/10 hover:text-[color:var(--accent-foreground)]',
      },
      size: {
        default: 'h-9 px-2 min-w-9',
        sm: 'h-8 px-1.5 min-w-8',
        lg: 'h-10 px-2.5 min-w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

function Toggle({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
