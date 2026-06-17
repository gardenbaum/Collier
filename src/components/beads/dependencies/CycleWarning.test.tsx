/**
 * Tests for CycleWarning.
 *
 * Contract: CycleWarning is a controlled informational banner
 * that renders a `message` prop and fires `onDismiss` when the
 * user clicks the dismiss `[X]`. The component is mono-only —
 * the brand colour is reserved for destructive actions and P0
 * (AC-14); this banner is informational, not destructive, so it
 * uses the standard mono pairing.
 */
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import { render } from '@/test/test-utils'

const importSut = () => import('./CycleWarning')

describe('CycleWarning', () => {
  it('renders the message', async () => {
    const { CycleWarning } = await importSut()
    render(<CycleWarning message="A → B → C → A" onDismiss={() => undefined} />)

    const banner = screen.getByTestId('cycle-warning')
    expect(banner).toBeInTheDocument()
    expect(banner.textContent).toContain('Cycle detected:')
    expect(banner.textContent).toContain('A → B → C → A')
  })

  it('clicking dismiss fires onDismiss', async () => {
    const onDismiss = vi.fn()
    const { CycleWarning } = await importSut()
    render(
      <CycleWarning
        message="beads-1 → beads-2 → beads-1"
        onDismiss={onDismiss}
      />
    )

    const dismissButton = screen.getByTestId('cycle-warning-dismiss')
    fireEvent.click(dismissButton)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('renders no brand colour (informational, not destructive)', async () => {
    const { CycleWarning } = await importSut()
    const { container } = render(
      <CycleWarning message="A → B → A" onDismiss={() => undefined} />
    )

    // ponytail: AC-14 — the brand colour is reserved for destructive
    // actions and the P0 priority badge only. The cycle warning is
    // informational (the user just hit an "add dep" error, not a
    // delete); it must stay on the mono palette.
    const html = container.innerHTML.toLowerCase()
    expect(html).not.toContain('c2410c')
  })
})
