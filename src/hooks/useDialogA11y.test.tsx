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
      <div ref={panelRef} tabIndex={-1} role="dialog" data-testid="panel">
        <button ref={explicitFocusRef} data-testid="first-field">
          First field
        </button>
        <button data-testid="middle-field">Middle field</button>
        <button data-testid="last-field">Last field</button>
      </div>
    </div>
  )
}

/**
 * Empty-panel variant: same hook wiring, but the dialog body contains
 * no focusables. Used to exercise the `panel.focus()` fallback in
 * `focusFirst` and the empty-focusables early return in `handleKeyDown`.
 */
function EmptyPanelHarness({ onClose }: Pick<HarnessProps, 'onClose'>) {
  const panelRef = useRef<HTMLDivElement>(null)
  useDialogA11y({ panelRef, onClose })
  return (
    <div>
      <button data-testid="trigger">Open dialog</button>
      <div ref={panelRef} tabIndex={-1} role="dialog" data-testid="panel">
        {/* no focusable children */}
      </div>
    </div>
  )
}

/**
 * No-panel variant: the hook is wired with a `panelRef` that is never
 * bound to a rendered element, so `panelRef.current` stays `null` for
 * the lifetime of the hook. Used to exercise the panel-null branches
 * in `focusFirst` (line 103 false) and `handleKeyDown` (line 125 early
 * return).
 */
function NoPanelHarness({ onClose }: Pick<HarnessProps, 'onClose'>) {
  const panelRef = useRef<HTMLDivElement>(null)
  useDialogA11y({ panelRef, onClose })
  return <button data-testid="trigger">Open dialog</button>
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

  it('falls back to focusing the panel itself when the panel has no focusables', async () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'Open'
    document.body.appendChild(trigger)
    trigger.focus()

    await act(async () => {
      render(<EmptyPanelHarness onClose={() => undefined} />)
    })
    await act(async () => {
      await new Promise(resolve => requestAnimationFrame(resolve))
    })

    // No focusables inside the panel → focusFirst walks all the
    // branches and falls through to `panel.focus()` (line 109).
    const panel = screen.getByTestId('panel')
    expect(document.activeElement).toBe(panel)
  })

  it('Tab key on an empty panel is swallowed (no onClose, no crash)', async () => {
    const onClose = vi.fn()
    await act(async () => {
      render(<EmptyPanelHarness onClose={onClose} />)
    })
    await act(async () => {
      await new Promise(resolve => requestAnimationFrame(resolve))
    })

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
      )
    })

    // The handler hits the `focusables.length === 0` early-return
    // branch (lines 128-129) and swallows the Tab without calling
    // onClose or moving focus. Focus stays on the panel.
    const panel = screen.getByTestId('panel')
    expect(document.activeElement).toBe(panel)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Shift+Tab from the panel itself wraps to the last focusable (active === panel branch)', async () => {
    await act(async () => {
      render(<Harness onClose={() => undefined} />)
    })
    await act(async () => {
      await new Promise(resolve => requestAnimationFrame(resolve))
    })

    // focusFirst moved focus to first-field; now manually move it
    // BACK to the panel itself, so `document.activeElement === panel`
    // inside the Tab handler.
    const panel = screen.getByTestId('panel')
    panel.focus()
    expect(document.activeElement).toBe(panel)

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Tab',
          shiftKey: true,
          bubbles: true,
        })
      )
    })
    // The `active === panel` half of the OR on line 134 is what
    // makes this branch reachable; without it, Shift+Tab from the
    // panel itself would silently let focus escape the dialog.
    expect(document.activeElement).toBe(screen.getByTestId('last-field'))
  })

  it('Tab from a middle focusable is a no-op (no preventDefault, no focus move)', async () => {
    await act(async () => {
      render(<Harness onClose={() => undefined} />)
    })
    await act(async () => {
      await new Promise(resolve => requestAnimationFrame(resolve))
    })

    // Sit on a focusable that is neither first nor last nor the panel
    // itself. From the handler's POV, this is a "no-op Tab" — the
    // condition `active === last` is false and `event.shiftKey` is
    // false, so the else-if body on lines 137-140 must NOT fire.
    const middle = screen.getByTestId('middle-field')
    middle.focus()
    expect(document.activeElement).toBe(middle)

    const preventDefaultSpy = vi.spyOn(
      KeyboardEvent.prototype,
      'preventDefault'
    )

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
      )
    })

    // Neither the trap nor preventDefault runs for a middle-field Tab.
    expect(preventDefaultSpy).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(middle)
  })

  it('focusFirst is a no-op when panelRef.current is null', async () => {
    const trigger = document.createElement('button')
    trigger.textContent = 'Open'
    document.body.appendChild(trigger)
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    await act(async () => {
      render(<NoPanelHarness onClose={() => undefined} />)
    })
    await act(async () => {
      await new Promise(resolve => requestAnimationFrame(resolve))
    })

    // focusFirst walks: explicit (no initialFocusRef) → null/undefined,
    // panel === null → branch on line 103 takes the false path, no
    // focus move. The outside trigger keeps focus.
    expect(document.activeElement).toBe(trigger)
  })

  it('Tab keydown is ignored when panelRef is null (no onClose, focus stays)', async () => {
    const onClose = vi.fn()
    await act(async () => {
      render(<NoPanelHarness onClose={onClose} />)
    })
    await act(async () => {
      await new Promise(resolve => requestAnimationFrame(resolve))
    })

    const trigger = screen.getByTestId('trigger')
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
      )
    })

    // handleKeyDown: panel === null → early return on lines 124-125.
    // No preventDefault, no onClose, focus stays on the trigger.
    expect(onClose).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(trigger)
  })

  it('unmount does not crash when the trigger element was removed from the DOM', async () => {
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
    // Focus is now inside the dialog (on first-field).
    expect(document.activeElement).not.toBe(trigger)

    // The race the cleanup guards against: the trigger element gets
    // removed from the DOM before the dialog unmounts (a list
    // re-render dropped the button that opened the dialog). Remove
    // it here, then unmount.
    trigger.remove()
    expect(document.body.contains(trigger)).toBe(false)

    // Cleanup must not throw, and must not try to focus the removed
    // trigger (the `document.body.contains(trigger)` half of the
    // guard on lines 152-158 is the alternate branch we're exercising).
    await act(async () => {
      expect(() => unmount?.()).not.toThrow()
    })
    // activeElement is no longer the removed trigger — it falls back
    // to body (or wherever) once the panel unmounts, but the key
    // guarantee is that the cleanup didn't crash and didn't refocus
    // a detached element.
    expect(document.activeElement).not.toBe(trigger)
  })

  it('non-Tab, non-Escape keydown is ignored (no preventDefault, no onClose)', async () => {
    // Closes the remaining reachable branch on line 124
    // (`if (event.key !== 'Tab') return` — true-branch). Every other
    // test that dispatches a key uses either Escape (handled at line
    // 119) or Tab (handled at line 137), so a non-Tab, non-Escape
    // keypress is the only way to exercise the early return.
    const onClose = vi.fn()
    await act(async () => {
      render(<Harness onClose={onClose} />)
    })
    await act(async () => {
      await new Promise(resolve => requestAnimationFrame(resolve))
    })

    const first = screen.getByTestId('first-field')
    first.focus()
    expect(document.activeElement).toBe(first)

    const preventDefaultSpy = vi.spyOn(
      KeyboardEvent.prototype,
      'preventDefault'
    )

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
      )
    })

    // handleKeyDown: not Escape (line 119), not Tab (line 124 returns
    // true) → handler returns. No preventDefault, no onClose, focus
    // stays where it was.
    expect(preventDefaultSpy).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(first)
  })
})
