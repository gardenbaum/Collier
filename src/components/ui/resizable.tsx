'use client'

import * as React from 'react'
import { GripVerticalIcon } from 'lucide-react'
import * as ResizablePrimitive from 'react-resizable-panels'

import { cn } from '@/lib/utils'

// Module-load guard: react-resizable-panels v3 named-exports the trio
// below; v2 exposed PanelGroup as a default export. A missing export
// would compile to `React.createElement(undefined, ...)` and surface as
// a cryptic mid-render "Element type is invalid" — fail fast instead.
{
  const missingExports: string[] = []
  if (typeof ResizablePrimitive.PanelGroup === 'undefined') {
    missingExports.push('PanelGroup')
  }
  if (typeof ResizablePrimitive.Panel === 'undefined') {
    missingExports.push('Panel')
  }
  if (typeof ResizablePrimitive.PanelResizeHandle === 'undefined') {
    missingExports.push('PanelResizeHandle')
  }
  if (missingExports.length > 0) {
    throw new Error(
      `react-resizable-panels is missing required exports: ${missingExports.join(', ')}. ` +
        `This wrapper targets react-resizable-panels@^3.0.0. ` +
        `Check your installed version with \`bun pm ls react-resizable-panels\`.`
    )
  }
}

function ResizablePanelGroup({
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelGroup>) {
  return (
    <ResizablePrimitive.PanelGroup
      data-slot="resizable-panel-group"
      className={cn(
        'flex h-full w-full data-[panel-group-direction=vertical]:flex-col',
        className
      )}
      {...props}
    />
  )
}

function ResizablePanel({
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Panel>) {
  return <ResizablePrimitive.Panel data-slot="resizable-panel" {...props} />
}

function ResizableHandle({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.PanelResizeHandle> & {
  withHandle?: boolean
}) {
  return (
    <ResizablePrimitive.PanelResizeHandle
      data-slot="resizable-handle"
      className={cn(
        'bg-border focus-visible:ring-ring relative flex w-px items-center justify-center after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:outline-hidden data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:translate-x-0 data-[panel-group-direction=vertical]:after:-translate-y-1/2 [&[data-panel-group-direction=vertical]>div]:rotate-90',
        className
      )}
      {...props}
    >
      {withHandle && (
        <div className="bg-border z-10 flex h-4 w-3 items-center justify-center rounded-xs border">
          <GripVerticalIcon className="size-2.5" />
        </div>
      )}
    </ResizablePrimitive.PanelResizeHandle>
  )
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
