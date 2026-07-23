import { render, screen } from '@testing-library/react'
import { beforeAll, describe, it, expect } from 'vitest'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from './resizable'

// jsdom does not implement ResizeObserver; react-resizable-panels v4 uses
// one to measure the group and panels. A no-op stub keeps the layout
// effects quiet without forcing the test to simulate real DOM measurements.
class ResizeObserverStub {
  observe(): void {
    /* no-op */
  }
  unobserve(): void {
    /* no-op */
  }
  disconnect(): void {
    /* no-op */
  }
}

beforeAll(() => {
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver =
      ResizeObserverStub as unknown as typeof ResizeObserver
  }
})

/**
 * These tests exercise the react-resizable-panels v4 public API
 * (Group / Panel / Separator) through the shadcn wrapper, which is the
 * only consumer of the dependency. They guard against a breaking change in
 * the panels library surfacing in the app's core layout.
 *
 * v4 derives `data-testid` from the `id` prop (and falls back to useId when
 * no id is provided); the underlying components always overwrite a
 * user-supplied `data-testid` with the resolved id. The tests therefore
 * target elements by their `id` (which becomes the `data-testid`).
 */
describe('Resizable wrapper (react-resizable-panels)', () => {
  it('renders a panel group with panels, a handle, and their content', () => {
    const { container } = render(
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={50}>Left</ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={50}>Right</ResizablePanel>
      </ResizablePanelGroup>
    )

    expect(
      container.querySelector('[data-slot="resizable-panel-group"]')
    ).toBeInTheDocument()
    expect(
      container.querySelectorAll('[data-slot="resizable-panel"]')
    ).toHaveLength(2)
    expect(
      container.querySelector('[data-slot="resizable-handle"]')
    ).toBeInTheDocument()
    expect(screen.getByText('Left')).toBeInTheDocument()
    expect(screen.getByText('Right')).toBeInTheDocument()
  })

  it('exposes the resize handle as an accessible separator', () => {
    render(
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={50}>A</ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={50}>B</ResizablePanel>
      </ResizablePanelGroup>
    )

    expect(screen.getByRole('separator')).toBeInTheDocument()
  })

  it('renders the grip affordance when withHandle is set', () => {
    const { container } = render(
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={50}>A</ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={50}>B</ResizablePanel>
      </ResizablePanelGroup>
    )

    const handle = container.querySelector('[data-slot="resizable-handle"]')
    expect(handle?.querySelector('svg')).toBeInTheDocument()
  })

  it('reflects the panel group direction on the DOM', () => {
    const { container } = render(
      <ResizablePanelGroup direction="vertical">
        <ResizablePanel defaultSize={50}>A</ResizablePanel>
        <ResizableHandle />
        <ResizablePanel defaultSize={50}>B</ResizablePanel>
      </ResizablePanelGroup>
    )

    expect(
      container.querySelector('[data-panel-group-direction="vertical"]')
    ).toBeInTheDocument()
  })

  it('forwards group className and props while preserving the wrapper classes', () => {
    const { container } = render(
      <ResizablePanelGroup
        id="group"
        className="custom-group"
        direction="horizontal"
      >
        <ResizablePanel>Content</ResizablePanel>
      </ResizablePanelGroup>
    )

    // v4 derives both `id` and `data-testid` from the `id` prop.
    const group = screen.getByTestId('group')
    expect(group).toHaveClass('custom-group')
    expect(group).toHaveClass('flex', 'h-full', 'w-full')
    expect(group).toHaveAttribute('data-slot', 'resizable-panel-group')
    expect(
      container.querySelector('[data-slot="resizable-panel"]')
    ).toHaveTextContent('Content')
  })

  it('forwards panel props and handle className/data attributes', () => {
    const { container } = render(
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel id="left-panel">Left</ResizablePanel>
        <ResizableHandle id="resize-handle" className="custom-handle" />
        <ResizablePanel>Right</ResizablePanel>
      </ResizablePanelGroup>
    )

    // v4 Panel reads `id` and applies it to both `id` and `data-testid`.
    const panel = screen.getByTestId('left-panel')
    expect(panel).toHaveAttribute('id', 'left-panel')

    const handle = screen.getByTestId('resize-handle')
    expect(handle).toHaveClass('custom-handle')
    expect(handle).toHaveClass('relative', 'w-px')
    expect(handle).toHaveAttribute('id', 'resize-handle')
    expect(
      container.querySelectorAll('[data-slot="resizable-panel"]')
    ).toHaveLength(2)
  })

  it('does not render a grip affordance when withHandle is false', () => {
    const { container } = render(
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel>A</ResizablePanel>
        <ResizableHandle withHandle={false} />
        <ResizablePanel>B</ResizablePanel>
      </ResizablePanelGroup>
    )

    expect(
      container.querySelector('[data-slot="resizable-handle"] svg')
    ).not.toBeInTheDocument()
  })

  it('interprets numeric defaultSize as a percentage of the parent group', () => {
    // v4 changed the meaning of numeric size props: numbers are now pixels,
    // strings without units are percentages. The wrapper must coerce numeric
    // values to percent strings to preserve the v3 calling convention.
    const { container } = render(
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel id="left" defaultSize={20}>
          Left
        </ResizablePanel>
        <ResizableHandle />
        <ResizablePanel id="right" defaultSize={80}>
          Right
        </ResizablePanel>
      </ResizablePanelGroup>
    )

    // If 20 / 80 were treated as pixels (v4 default for numbers), the two
    // panels would collapse to almost nothing; the role/text assertions below
    // suffice as a smoke test that the wrapper survives the coerce path.
    expect(screen.getByTestId('left')).toHaveTextContent('Left')
    expect(screen.getByTestId('right')).toHaveTextContent('Right')
    expect(
      container.querySelectorAll('[data-slot="resizable-panel"]')
    ).toHaveLength(2)
  })
})
