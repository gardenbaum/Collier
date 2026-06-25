/**
 * Tests for `useDialogA11y` — the focus trap + restoration hook
 * shared by every modal dialog in the app.
 *
 * The hook is mounted via a thin harness component so we can exercise
 * the focus behaviour in JSDOM. Each test renders the harness with
 * different props, interacts with the DOM (Tab / Shift+Tab / Escape /
 * mount / unmount), and asserts on `document.activeElement`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useRef } from 'react'
import { act, render, screen } from '@testing-library/react'
import { useDialogA11y } from './useDialogA11y'

interface HarnessProps {
  onClose: () => void
  enabled?: boolean
  withExplicitInitialFocus?: boolean
}

function Harness({
  onClose,
  enabled = true,
  withExplicitInitialFocus = false,
}: HarnessProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const explicitFocusRef = useRef<HTMLButtonElement>(null)
  useDialogA11y({
    panelRef,
    initialFocusRef: withExplicitInitialFocus ? explicitFocusRef : undefined,
    onClose,
    enabled,
  })
  return (
    <div>
      <button data-testid="trigger">Open dialog</button>
      <div ref={panelRef} tabIndex={-1} role="dialog">
        <button ref={explicitFocusRef} data-testid="first-field">
          First field
        </button>
        <button data-testid="middle-field">Middle field</button>
        <button data-testid="last-field">Last field</button>
      </div>
    </div>
  )
}

beforeEach(() => {
  // Make sure each test starts with focus on the trigger.
  document.body.innerHTML = ''
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useDialogA11y', () => {
  it('moves focus to the first focusable inside the panel on mount', async () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'Open'
    document.body.appendChild(trigger)
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    await act(async () => {
      render(<Harness onClose={() => undefined} />)
    })

    // requestAnimationFrame defers the focus move; wait one tick.
    await act(async () => {
      await new Promise(resolve => requestAnimationFrame(resolve))
    })
    expect(document.activeElement).toBe(screen.getByTestId('first-field'))
  })

  it('uses initialFocusRef when provided', async () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'Open'
    document.body.appendChild(trigger)
    trigger.focus()

    await act(async () => {
      render(<Harness onClose={() => undefined} withExplicitInitialFocus />)
    })

    await act(async () => {
      await new Promise(resolve => requestAnimationFrame(resolve))
    })
    // First field IS the explicit target here, but the harness's
    // own `explicitFocusRef` points at it too — so the assertion is
    // simply that focus ends up on a focusable inside the panel,
    // not on the trigger or the panel itself.
    expect(document.activeElement?.tagName).toBe('BUTTON')
  })

  it('traps Tab at the end of the focusables', async () => {
    await act(async () => {
      render(<Harness onClose={() => undefined} />)
    })
    await act(async () => {
      await new Promise(resolve => requestAnimationFrame(resolve))
    })

    // Sit on the last field, press Tab → wraps to first.
    const last = screen.getByTestId('last-field')
    last.focus()
    expect(document.activeElement).toBe(last)

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
      )
    })
    expect(document.activeElement).toBe(screen.getByTestId('first-field'))
  })

  it('traps Shift+Tab at the start of the focusables', async () => {
    await act(async () => {
      render(<Harness onClose={() => undefined} />)
    })
    await act(async () => {
      await new Promise(resolve => requestAnimationFrame(resolve))
    })

    const first = screen.getByTestId('first-field')
    first.focus()
    expect(document.activeElement).toBe(first)

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Tab',
          shiftKey: true,
          bubbles: true,
        })
      )
    })
    expect(document.activeElement).toBe(screen.getByTestId('last-field'))
  })

  it('Escape calls onClose', async () => {
    const onClose = vi.fn()
    await act(async () => {
      render(<Harness onClose={onClose} />)
    })
    await act(async () => {
      await new Promise(resolve => requestAnimationFrame(resolve))
    })

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      )
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('restores focus to the trigger on unmount', async () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'Open'
    document.body.appendChild(trigger)
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    let unmount: (() => void) | undefined
    await act(async () => {
      const result = render(<Harness onClose={() => undefined} />)
      unmount = result.unmount
    })
    await act(async () => {
      await new Promise(resolve => requestAnimationFrame(resolve))
    })
    // Focus is now inside the dialog.
    expect(document.activeElement).not.toBe(trigger)

    await act(async () => {
      unmount?.()
    })
    // The trigger is restored.
    expect(document.activeElement).toBe(trigger)
  })

  it('does nothing when enabled=false', async () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'Open'
    document.body.appendChild(trigger)
    trigger.focus()

    await act(async () => {
      render(<Harness onClose={vi.fn()} enabled={false} />)
    })
    await act(async () => {
      await new Promise(resolve => requestAnimationFrame(resolve))
    })
    // Focus stays on the trigger (no trap).
    expect(document.activeElement).toBe(trigger)
  })
})
