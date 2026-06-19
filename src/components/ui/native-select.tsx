import * as React from 'react'
import { ChevronDownIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <div
      className="group/native-select relative w-fit has-[select:disabled]:opacity-50"
      data-slot="native-select-wrapper"
    >
      <select
        data-slot="native-select"
        className={cn(
          'border-[color:var(--border)] placeholder:text-[color:var(--muted-foreground)] selection:bg-[color:var(--primary)] selection:text-[color:var(--primary-foreground)] h-9 w-full min-w-0 appearance-none rounded-[var(--radius)] border bg-transparent px-3 py-2 pr-9 text-sm shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed',
          'focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--background)]',
          'aria-invalid:ring-[color:var(--destructive)] aria-invalid:border-[color:var(--destructive)]',
          className
        )}
        {...props}
      />
      <ChevronDownIcon
        className="text-[color:var(--muted-foreground)] pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 opacity-50 select-none"
        aria-hidden="true"
        data-slot="native-select-icon"
      />
    </div>
  )
}

function NativeSelectOption({ ...props }: React.ComponentProps<'option'>) {
  return <option data-slot="native-select-option" {...props} />
}

function NativeSelectOptGroup({
  className,
  ...props
}: React.ComponentProps<'optgroup'>) {
  return (
    <optgroup
      data-slot="native-select-optgroup"
      className={cn(className)}
      {...props}
    />
  )
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption }
