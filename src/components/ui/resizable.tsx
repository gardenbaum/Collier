'use client'

import * as React from 'react'
import { GripVerticalIcon } from 'lucide-react'
import { Group, Panel, Separator } from 'react-resizable-panels'

import { cn } from '@/lib/utils'

// Module-load guard: react-resizable-panels v4 exposes `Group`, `Panel`,
// and `Separator` as named exports. v3 used `PanelGroup`/`PanelResizeHandle`
// and v2 exposed `PanelGroup` as a default export. A missing export would
// compile to `React.createElement(undefined, ...)` and surface as a cryptic
// mid-render "Element type is invalid" — fail fast instead.
{
  const missingExports: string[] = []
  if (typeof Group === 'undefined') {
    missingExports.push('Group')
  }
  if (typeof Panel === 'undefined') {
    missingExports.push('Panel')
  }
  if (typeof Separator === 'undefined') {
    missingExports.push('Separator')
  }
  if (missingExports.length > 0) {
    throw new Error(
      `react-resizable-panels is missing required exports: ${missingExports.join(', ')}. ` +
        `This wrapper targets react-resizable-panels@^4.0.0. ` +
        `Check your installed version with \`bun pm ls react-resizable-panels\`.`
    )
  }
}

type GroupProps = React.ComponentProps<typeof Group>
type PanelProps = React.ComponentProps<typeof Panel>
type SeparatorProps = React.ComponentProps<typeof Separator>

// v4 changed the meaning of numeric size props: numbers are now pixels and
// strings (without an explicit unit) are percentages. The wrapper preserves
// the v3 calling convention where numeric size props are percentages so
// existing call sites (e.g. `defaultSize={LAYOUT.sidebar.default}`) keep
// working unchanged.
function toPercent(
  value: number | string | undefined
): number | string | undefined {
  if (typeof value === 'number') return `${value}%`
  return value
}

type ResizablePanelGroupProps = Omit<GroupProps, 'orientation'> & {
  /**
   * Direction of the panel group. In v4 this maps to the underlying
   * `orientation` prop on `Group`. Kept as `direction` for backwards
   * compatibility with the v3 shadcn wrapper shape.
   */
  direction?: 'horizontal' | 'vertical'
}

function ResizablePanelGroup({
  className,
  direction = 'horizontal',
  ...props
}: ResizablePanelGroupProps) {
  return (
    <Group
      data-slot="resizable-panel-group"
      data-panel-group-direction={direction}
      orientation={direction}
      className={cn(
        'flex h-full w-full data-[panel-group-direction=vertical]:flex-col',
        className
      )}
      {...props}
    />
  )
}

type ResizablePanelProps = Omit<
  PanelProps,
  'defaultSize' | 'minSize' | 'maxSize' | 'collapsedSize'
> & {
  defaultSize?: number | string
  minSize?: number | string
  maxSize?: number | string
  collapsedSize?: number | string
}

function ResizablePanel({
  defaultSize,
  minSize,
  maxSize,
  collapsedSize,
  ...props
}: ResizablePanelProps) {
  return (
    <Panel
      data-slot="resizable-panel"
      defaultSize={toPercent(defaultSize)}
      minSize={toPercent(minSize)}
      maxSize={toPercent(maxSize)}
      collapsedSize={toPercent(collapsedSize)}
      {...props}
    />
  )
}

type ResizableHandleProps = Omit<SeparatorProps, 'children'> & {
  /**
   * Render the shadcn-style grip affordance (small icon inside the handle).
   * Not part of v4's `Separator` API — it is a wrapper-level convenience.
   */
  withHandle?: boolean
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: ResizableHandleProps) {
  return (
    <Separator
      data-slot="resizable-handle"
      className={cn(
        // v4 sets `aria-orientation` on the Separator equal to the opposite
        // of the parent Group's orientation (the bar slides perpendicular to
        // the layout). When the group is vertical, the separator's
        // aria-orientation is "horizontal" and the grip icon needs to be
        // rotated 90° to remain vertical.
        'relative flex w-px items-center justify-center bg-transparent hover:bg-[color:var(--accent)]/10 after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[color:var(--ring)] [&[aria-orientation=horizontal]>div]:rotate-90',
        className
      )}
      {...props}
    >
      {withHandle && (
        <div className="bg-[color:var(--border)] z-10 flex h-4 w-3 items-center justify-center rounded-xs border border-[color:var(--border)]">
          <GripVerticalIcon className="size-2.5" />
        </div>
      )}
    </Separator>
  )
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
