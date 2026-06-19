import * as React from 'react'

import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'file:text-[color:var(--foreground)] placeholder:text-[color:var(--muted-foreground)] selection:bg-[color:var(--primary)] selection:text-[color:var(--primary-foreground)] border-[color:var(--border)] h-9 w-full min-w-0 rounded-[var(--radius)] border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--background)]',
        'aria-invalid:ring-[color:var(--destructive)] aria-invalid:border-[color:var(--destructive)]',
        className
      )}
      {...props}
    />
  )
}

export { Input }
