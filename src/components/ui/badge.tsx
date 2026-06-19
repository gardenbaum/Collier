import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-[var(--radius)] border border-[color:var(--border)] px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--background)] aria-invalid:ring-[color:var(--destructive)] aria-invalid:border-[color:var(--destructive)] transition-[color,box-shadow] overflow-hidden',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-[color:var(--primary)] text-[color:var(--primary-foreground)] [a&]:hover:opacity-90',
        secondary:
          'border-transparent bg-[color:var(--secondary)] text-[color:var(--secondary-foreground)] [a&]:hover:opacity-80',
        destructive:
          'border-transparent bg-[color:var(--destructive)] text-[color:var(--destructive-foreground)] [a&]:hover:opacity-90',
        outline:
          'text-[color:var(--foreground)] [a&]:hover:bg-[color:var(--accent)]/10 [a&]:hover:text-[color:var(--accent-foreground)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span'

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
