import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

import { MacOSIcons, WindowsIcons } from './WindowControlIcons'

/**
 * These tests cover the macOS SVG icon wrappers in
 * `src/components/titlebar/WindowControlIcons.tsx`. The MacOSIcons object
 * exposes four entries — `close`, `minimize`, `fullscreen`, `maximize` —
 * each as a thin component that returns an inline `<svg>` and spreads
 * the caller's `SVGProps<SVGSVGElement>` onto the root element. The
 * WindowsIcons are already exercised indirectly by the existing
 * `WindowsWindowControls.test.tsx`, but we render them here too as a
 * cheap sanity check so the optional AC is covered.
 *
 * Render pattern: each entry is rendered standalone (no wrapper) into
 * the host div returned by `render`. We assert that the returned tree
 * contains an `<svg>` element and that caller-supplied props
 * (`aria-label`, `data-testid`, `className`) are forwarded onto the
 * SVG node. The icon JSX uses `...props` after its hard-coded SVG
 * attributes, so forwarded props win on collisions — we do not
 * exhaustively re-assert those attribute values, only that the spread
 * happened.
 */
describe('WindowControlIcons.MacOSIcons', () => {
  it('close: renders an <svg> and forwards aria-label, data-testid, and className', () => {
    const { container } = render(
      <MacOSIcons.close
        aria-label="Close"
        data-testid="mac-close"
        className="custom-close"
      />
    )

    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg).toHaveAttribute('aria-label', 'Close')
    expect(svg).toHaveAttribute('data-testid', 'mac-close')
    expect(svg).toHaveClass('custom-close')
    // The hard-coded SVG geometry must still be present.
    expect(svg).toHaveAttribute('viewBox', '0 0 16 18')
  })

  it('minimize: renders an <svg> and forwards aria-label, data-testid, and className', () => {
    const { container } = render(
      <MacOSIcons.minimize
        aria-label="Minimize"
        data-testid="mac-minimize"
        className="custom-minimize"
      />
    )

    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg).toHaveAttribute('aria-label', 'Minimize')
    expect(svg).toHaveAttribute('data-testid', 'mac-minimize')
    expect(svg).toHaveClass('custom-minimize')
    expect(svg).toHaveAttribute('viewBox', '0 0 17 6')
  })

  it('fullscreen: renders an <svg> and forwards aria-label, data-testid, and className', () => {
    const { container } = render(
      <MacOSIcons.fullscreen
        aria-label="Enter fullscreen"
        data-testid="mac-fullscreen"
        className="custom-fullscreen"
      />
    )

    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg).toHaveAttribute('aria-label', 'Enter fullscreen')
    expect(svg).toHaveAttribute('data-testid', 'mac-fullscreen')
    expect(svg).toHaveClass('custom-fullscreen')
    expect(svg).toHaveAttribute('viewBox', '0 0 15 15')
  })

  it('maximize: renders an <svg> and forwards aria-label, data-testid, and className', () => {
    const { container } = render(
      <MacOSIcons.maximize
        aria-label="Maximize"
        data-testid="mac-maximize"
        className="custom-maximize"
      />
    )

    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg).toHaveAttribute('aria-label', 'Maximize')
    expect(svg).toHaveAttribute('data-testid', 'mac-maximize')
    expect(svg).toHaveClass('custom-maximize')
    expect(svg).toHaveAttribute('viewBox', '0 0 17 16')
  })
})

/**
 * Optional sanity check: render each WindowsIcons entry too. The Windows
 * wrappers are already covered indirectly by the titlebar integration
 * tests, but rendering them here keeps the file self-contained and
 * future-proofs against that coverage slipping.
 */
describe('WindowControlIcons.WindowsIcons', () => {
  it('minimize: renders an <svg> and forwards className', () => {
    const { container } = render(
      <WindowsIcons.minimize
        aria-label="Minimize"
        data-testid="win-minimize"
        className="custom-win-minimize"
      />
    )

    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg).toHaveAttribute('aria-label', 'Minimize')
    expect(svg).toHaveAttribute('data-testid', 'win-minimize')
    expect(svg).toHaveClass('custom-win-minimize')
    expect(svg).toHaveAttribute('viewBox', '0 0 10 1')
  })

  it('maximize: renders an <svg> and forwards className', () => {
    const { container } = render(
      <WindowsIcons.maximize
        aria-label="Maximize"
        data-testid="win-maximize"
        className="custom-win-maximize"
      />
    )

    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg).toHaveAttribute('aria-label', 'Maximize')
    expect(svg).toHaveAttribute('data-testid', 'win-maximize')
    expect(svg).toHaveClass('custom-win-maximize')
    expect(svg).toHaveAttribute('viewBox', '0 0 10 10')
  })

  it('restore: renders an <svg> and forwards className', () => {
    const { container } = render(
      <WindowsIcons.restore
        aria-label="Restore"
        data-testid="win-restore"
        className="custom-win-restore"
      />
    )

    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg).toHaveAttribute('aria-label', 'Restore')
    expect(svg).toHaveAttribute('data-testid', 'win-restore')
    expect(svg).toHaveClass('custom-win-restore')
    expect(svg).toHaveAttribute('viewBox', '0 0 10 10')
  })

  it('close: renders an <svg> and forwards className', () => {
    const { container } = render(
      <WindowsIcons.close
        aria-label="Close"
        data-testid="win-close"
        className="custom-win-close"
      />
    )

    const svg = container.querySelector('svg')
    expect(svg).toBeInTheDocument()
    expect(svg).toHaveAttribute('aria-label', 'Close')
    expect(svg).toHaveAttribute('data-testid', 'win-close')
    expect(svg).toHaveClass('custom-win-close')
    expect(svg).toHaveAttribute('viewBox', '0 0 10 10')
  })
})
