import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from './resizable'

/**
 * These tests exercise the react-resizable-panels v4 public API
 * (PanelGroup / Panel / PanelResizeHandle) through the shadcn wrapper, which is
 * the only consumer of the dependency. They guard against a breaking change in
 * the panels library surfacing in the app's core layout.
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
        className="custom-group"
        data-testid="group"
        direction="horizontal"
      >
        <ResizablePanel>Content</ResizablePanel>
      </ResizablePanelGroup>
    )

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
        <ResizablePanel id="left-panel" data-testid="panel">
          Left
        </ResizablePanel>
        <ResizableHandle
          className="custom-handle"
          data-testid="handle"
          id="resize-handle"
        />
        <ResizablePanel>Right</ResizablePanel>
      </ResizablePanelGroup>
    )

    expect(screen.getByTestId('panel')).toHaveAttribute('id', 'left-panel')
    const handle = screen.getByTestId('handle')
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
})
