import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--background)] aria-invalid:ring-[color:var(--destructive)] aria-invalid:border-[color:var(--destructive)]",
  {
    variants: {
      variant: {
        default:
          'bg-[color:var(--primary)] text-[color:var(--primary-foreground)] hover:opacity-90',
        destructive:
          'bg-[color:var(--destructive)] text-[color:var(--destructive-foreground)] hover:opacity-90',
        outline:
          'border bg-[color:var(--background)] shadow-xs hover:bg-[color:var(--accent)]/10 hover:text-[color:var(--accent-foreground)] border-[color:var(--border)]',
        secondary:
          'bg-[color:var(--secondary)] text-[color:var(--secondary-foreground)] hover:opacity-80',
        subtle:
          'bg-transparent text-[color:var(--foreground)] hover:bg-[color:var(--secondary)]',
        ghost:
          'bg-transparent text-[color:var(--foreground)] hover:bg-[color:var(--accent)]/10',
        link: 'text-[color:var(--primary)] underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-10 px-6 has-[>svg]:px-4',
        icon: 'size-9',
        'icon-sm': 'size-8',
        'icon-lg': 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
