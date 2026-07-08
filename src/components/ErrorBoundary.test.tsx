/**
 * Tests for the application-level ErrorBoundary.
 *
 * The boundary runs at the root of the React tree and is the last
 * line of defence against an unhandled render error. It must:
 *   - render children normally while everything is healthy
 *   - catch errors thrown in descendants and render the friendly
 *     fallback ("Something went wrong")
 *   - log the error and persist crash state via saveCrashState
 *   - expose "Reload Application" + "Try Again" affordances
 *   - expose error details in DEV mode and hide them in production
 *
 * These tests cover the four behaviours above by throwing from a
 * child component and asserting on the boundary's render + side
 * effects.
 */
import { Component, type ReactNode } from 'react'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ErrorBoundary } from './ErrorBoundary'

// vi.hoisted lets the mock factory close over the same `vi.fn()`
// references the test body resets between cases.
const { mockSaveCrashState, mockLogger } = vi.hoisted(() => ({
  mockSaveCrashState: vi.fn(),
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/lib/recovery', () => ({
  saveCrashState: mockSaveCrashState,
}))

vi.mock('@/lib/logger', () => ({
  logger: mockLogger,
}))

// A child component that throws when `shouldThrow` is true. Using a
// class so the throw happens during render (which is what triggers a
// React error boundary - async throws don't).
interface BombProps {
  shouldThrow: boolean
  message?: string
}

class Bomb extends Component<BombProps> {
  override render(): ReactNode {
    if (this.props.shouldThrow) {
      throw new Error(this.props.message ?? 'boom')
    }
    return <div data-testid="child-ok">child ok</div>
  }
}

// In React, an unhandled error inside `render()` bubbles up and is
// reported as a console.error. Suppress that noise - the assertion
// we care about is the boundary's behaviour, not React's logging.
const originalConsoleError = console.error
beforeEach(() => {
  console.error = vi.fn()
  vi.clearAllMocks()
  // Default to PROD so tests that don't care about the dev branch
  // don't accidentally assert on the error-details block. Individual
  // tests override via `vi.stubEnv('DEV', true)`.
  vi.stubEnv('DEV', false)
})

afterEach(() => {
  console.error = originalConsoleError
  vi.unstubAllEnvs()
})

describe('ErrorBoundary', () => {
  it('renders its children when no error is thrown', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={false} />
      </ErrorBoundary>
    )
    expect(screen.getByTestId('child-ok')).toBeInTheDocument()
  })

  it('renders the fallback UI when a child throws during render', () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} message="disk on fire" />
      </ErrorBoundary>
    )

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(
      screen.getByText(/The application encountered an unexpected error/)
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Reload Application/i })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Try Again/i })
    ).toBeInTheDocument()
    // The healthy child is gone - the boundary replaced the tree.
    expect(screen.queryByTestId('child-ok')).not.toBeInTheDocument()
  })

  it('logs the crash via logger.error with the error message and stack', async () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} message="needle-message" />
      </ErrorBoundary>
    )

    await waitFor(() => {
      expect(mockLogger.error).toHaveBeenCalled()
    })

    const [label, payload] = mockLogger.error.mock.calls[0] ?? []
    expect(label).toBe('Application crashed')
    expect(payload).toMatchObject({ error: 'needle-message' })
    expect(typeof (payload as { stack?: unknown }).stack).toBe('string')
  })

  it('persists crash state via saveCrashState with url/userAgent/timestamp', async () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} message="persist-me" />
      </ErrorBoundary>
    )

    await waitFor(() => {
      expect(mockSaveCrashState).toHaveBeenCalledTimes(1)
    })

    const [appState, crashInfo] = mockSaveCrashState.mock.calls[0] ?? []
    expect(appState).toMatchObject({
      url: window.location.href,
      userAgent: navigator.userAgent,
    })
    expect(typeof (appState as { timestamp?: unknown }).timestamp).toBe(
      'string'
    )
    expect(crashInfo).toMatchObject({
      error: 'persist-me',
      stack: expect.stringContaining('persist-me'),
    })
  })

  it('logs but does not throw when saveCrashState itself rejects', async () => {
    // The boundary must NEVER rethrow out of componentDidCatch - that
    // would loop React into an infinite error state. We assert that
    // the error path inside saveCrashData is hit and the boundary
    // still renders the fallback.
    const boom = new Error('disk unwritable')
    mockSaveCrashState.mockRejectedValueOnce(boom)

    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} message="outer" />
      </ErrorBoundary>
    )

    await waitFor(() => {
      expect(mockSaveCrashState).toHaveBeenCalledTimes(1)
    })

    // Give the rejected promise a microtask to settle into the catch.
    await waitFor(() => {
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to save crash data',
        expect.objectContaining({ saveError: boom })
      )
    })

    // Fallback UI is still up.
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })

  it('falls back to a placeholder stack when the error has no stack', async () => {
    // jsdom's Error subclass strips the stack for messages we don't
    // construct via new Error(...). We simulate that here by deleting
    // the stack property before throwing.
    class StacklessBomb extends Component<{ message: string }> {
      override render(): ReactNode {
        const err = new Error(this.props.message)
        err.stack = undefined
        throw err
        // unreachable; satisfies `react/require-render-return`
        return null
      }
    }

    render(
      <ErrorBoundary>
        <StacklessBomb message="no-stack" />
      </ErrorBoundary>
    )

    await waitFor(() => {
      expect(mockSaveCrashState).toHaveBeenCalledTimes(1)
    })

    const [, crashInfo] = mockSaveCrashState.mock.calls[0] ?? []
    expect((crashInfo as { stack?: string }).stack).toBe(
      'No stack trace available'
    )
  })

  it('forwards the componentStack to saveCrashState', async () => {
    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} message="with-stack" />
      </ErrorBoundary>
    )

    await waitFor(() => {
      expect(mockSaveCrashState).toHaveBeenCalledTimes(1)
    })

    const [, crashInfo] = mockSaveCrashState.mock.calls[0] ?? []
    // jsdom gives us an empty componentStack for thrown render errors;
    // the boundary forwards it through (undefined fallback) regardless.
    expect('componentStack' in (crashInfo as object)).toBe(true)
  })

  it('reload button calls window.location.reload', async () => {
    // jsdom defines window.location.reload as a non-configurable own
    // property, so we can't spy on the method directly. Instead stub
    // the entire `location` global with a shallow copy that swaps
    // `reload` for a vi.fn() — the boundary calls `window.location.reload()`
    // which resolves through `window.location`, so the stub fires.
    const reloadSpy = vi.fn()
    const originalLocation = window.location
    const stubLocation = { ...originalLocation, reload: reloadSpy }
    vi.stubGlobal('location', stubLocation)

    try {
      const user = userEvent.setup()
      render(
        <ErrorBoundary>
          <Bomb shouldThrow={true} />
        </ErrorBoundary>
      )

      await user.click(
        screen.getByRole('button', { name: /Reload Application/i })
      )
      expect(reloadSpy).toHaveBeenCalledTimes(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('try-again button resets the boundary state and re-renders children', async () => {
    // Controlled child: starts by throwing, then stops throwing on a
    // re-render. Resetting the boundary re-mounts its subtree which
    // picks up the new prop.
    const React = await import('react')
    const { useState } = React

    function Toggle({ throwing }: { throwing: boolean }): ReactNode {
      if (throwing) throw new Error('toggle-throw')
      return <div data-testid="recovered">recovered</div>
    }

    const Wrapper = () => {
      const [throwing, setThrowing] = useState(true)
      return (
        <>
          <ErrorBoundary>
            <Toggle throwing={throwing} />
          </ErrorBoundary>
          <button type="button" onClick={() => setThrowing(false)}>
            stop
          </button>
        </>
      )
    }

    const user = userEvent.setup()
    render(<Wrapper />)

    // First render: child throws, fallback shown.
    expect(await screen.findByText('Something went wrong')).toBeInTheDocument()

    // Flip the child to non-throwing, then reset the boundary.
    await user.click(screen.getByRole('button', { name: /stop/i }))
    await user.click(screen.getByRole('button', { name: /Try Again/i }))

    // The recovered child should now be visible.
    expect(await screen.findByTestId('recovered')).toBeInTheDocument()
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
  })

  it('hides error details in production (import.meta.env.DEV === false)', () => {
    vi.stubEnv('DEV', false)

    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} message="hidden-in-prod" />
      </ErrorBoundary>
    )

    expect(screen.queryByText(/Error Details \(Development Only\)/)).toBeNull()
    expect(screen.queryByText(/hidden-in-prod/)).toBeNull()
  })

  it('shows error details (name, message, stack) in development mode', async () => {
    vi.stubEnv('DEV', true)

    render(
      <ErrorBoundary>
        <Bomb shouldThrow={true} message="dev-only-detail" />
      </ErrorBoundary>
    )

    // Summary is rendered once DEV-mode details are visible.
    const summary = await screen.findByText(
      /Error Details \(Development Only\)/
    )
    expect(summary).toBeInTheDocument()

    // The error name + message live in a dedicated <div> with the
    // "destructive font-semibold" class. The full stack lives in the
    // adjacent <pre>. Asserting on the div keeps this test focused
    // on the name/message; a sibling pre-existence check covers the
    // stack rendering.
    expect(
      screen.getByText((content, element) => {
        return (
          element?.tagName.toLowerCase() === 'div' &&
          element.className.includes('text-destructive') &&
          content.includes('Error') &&
          content.includes('dev-only-detail')
        )
      })
    ).toBeInTheDocument()
    expect(
      screen.getByText((content, element) => {
        return (
          element?.tagName.toLowerCase() === 'pre' &&
          content.includes('dev-only-detail')
        )
      })
    ).toBeInTheDocument()
  })
})
