import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        'bg-[color:var(--accent)] animate-pulse rounded-[var(--radius)]',
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
