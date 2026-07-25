import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@/test/test-utils'
import { WindowsWindowControls } from './WindowsWindowControls'

const { mockWindowApi, mockExecuteCommand, mockCommandContext } = vi.hoisted(
  () => ({
    mockWindowApi: {
      close: vi.fn(),
      minimize: vi.fn(),
      isMaximized: vi.fn(),
      maximize: vi.fn(),
      unmaximize: vi.fn(),
      onResized: vi.fn(),
    },
    mockExecuteCommand: vi.fn(),
    mockCommandContext: {
      openPreferences: vi.fn(),
      showToast: vi.fn(),
    },
  })
)

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => mockWindowApi),
}))

vi.mock('@/lib/commands', () => ({
  executeCommand: mockExecuteCommand,
}))

vi.mock('@/hooks/use-command-context', () => ({
  useCommandContext: () => mockCommandContext,
}))

describe('WindowsWindowControls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWindowApi.isMaximized.mockResolvedValue(false)
    mockWindowApi.onResized.mockResolvedValue(() => undefined)
    mockWindowApi.maximize.mockResolvedValue(undefined)
    mockWindowApi.unmaximize.mockResolvedValue(undefined)
    mockExecuteCommand.mockResolvedValue({ success: true })
  })

  it('calls window-minimize when the minimise button is clicked', async () => {
    render(<WindowsWindowControls />)
    await fireEvent.click(
      screen.getByRole('button', { name: 'Minimize window' })
    )
    expect(mockExecuteCommand).toHaveBeenCalledWith(
      'window-minimize',
      mockCommandContext
    )
  })

  it('calls window-close when the close button is clicked', async () => {
    render(<WindowsWindowControls />)
    await fireEvent.click(screen.getByRole('button', { name: 'Close window' }))
    expect(mockExecuteCommand).toHaveBeenCalledWith(
      'window-close',
      mockCommandContext
    )
  })

  it('maximises the window when not currently maximised', async () => {
    mockWindowApi.isMaximized.mockResolvedValue(false)
    render(<WindowsWindowControls />)
    await fireEvent.click(
      screen.getByRole('button', { name: 'Maximize window' })
    )
    expect(mockWindowApi.maximize).toHaveBeenCalledTimes(1)
    expect(mockWindowApi.unmaximize).not.toHaveBeenCalled()
  })

  it('unmaximises the window when currently maximised', async () => {
    mockWindowApi.isMaximized.mockResolvedValue(true)
    render(<WindowsWindowControls />)
    // The useEffect's isMaximized() promise must resolve before the
    // label flips to "Restore window" — flush it.
    await act(async () => {
      await Promise.resolve()
    })
    const restoreBtn = await screen.findByRole('button', {
      name: 'Restore window',
    })
    await fireEvent.click(restoreBtn)
    expect(mockWindowApi.unmaximize).toHaveBeenCalledTimes(1)
    expect(mockWindowApi.maximize).not.toHaveBeenCalled()
  })

  it('falls back to window-toggle-maximize command when isMaximized throws', async () => {
    mockWindowApi.isMaximized.mockRejectedValue(new Error('broken'))
    render(<WindowsWindowControls />)
    await fireEvent.click(
      screen.getByRole('button', { name: 'Maximize window' })
    )
    expect(mockExecuteCommand).toHaveBeenCalledWith(
      'window-toggle-maximize',
      mockCommandContext
    )
  })

  it('subscribes to onResized and tears down the subscription on unmount', async () => {
    const unsub = vi.fn()
    mockWindowApi.onResized.mockResolvedValue(unsub)
    const { unmount } = render(<WindowsWindowControls />)
    await act(async () => {
      await Promise.resolve()
    })
    expect(mockWindowApi.onResized).toHaveBeenCalled()
    unmount()
    expect(unsub).toHaveBeenCalled()
  })

  it('updates isMaximized state when an onResized event fires', async () => {
    let resizeHandler: (() => Promise<void>) | null = null
    mockWindowApi.onResized.mockImplementation(
      async (handler: () => Promise<void>) => {
        resizeHandler = handler
        return () => undefined
      }
    )
    mockWindowApi.isMaximized
      .mockResolvedValueOnce(false) // initial state
      .mockResolvedValueOnce(true) // after resize

    render(<WindowsWindowControls />)
    await act(async () => {
      await Promise.resolve()
    })

    expect(
      screen.getByRole('button', { name: 'Maximize window' })
    ).toBeInTheDocument()

    await act(async () => {
      if (resizeHandler) await resizeHandler()
    })

    expect(
      screen.getByRole('button', { name: 'Restore window' })
    ).toBeInTheDocument()
  })

  it('ignores resize events that fire after unmount (aborted=true)', async () => {
    // Edge case: a resize event is delivered *after* the component has
    // unmounted. The handler's `if (!aborted)` guard must short-circuit
    // so the unmounted component does not receive a setState call. The
    // query inside the handler still runs (the await is unconditional),
    // but the resulting setIsMaximized must be skipped.
    let resizeHandler: (() => Promise<void>) | null = null
    mockWindowApi.onResized.mockImplementation(
      async (handler: () => Promise<void>) => {
        resizeHandler = handler
        return () => undefined
      }
    )
    mockWindowApi.isMaximized.mockResolvedValue(false)

    const { unmount } = render(<WindowsWindowControls />)
    await act(async () => {
      await Promise.resolve()
    })
    // After mount: isMaximized was queried once for the initial state.
    expect(mockWindowApi.isMaximized).toHaveBeenCalledTimes(1)

    unmount()

    // The Tauri side delivers a late resize event after we tore down.
    expect(resizeHandler).not.toBeNull()
    await act(async () => {
      if (resizeHandler) await resizeHandler()
    })

    // The handler ran its query (count goes 1 → 2), but the aborted
    // guard prevented the setIsMaximized path. Verify by counting
    // queries: one initial + one inside the late handler.
    expect(mockWindowApi.isMaximized).toHaveBeenCalledTimes(2)
  })

  it('unsubscribes via the .then handler when abort happens before onResized resolves', async () => {
    // Edge case: the user unmounts the title bar before Tauri returns
    // the resize-subscription handle. The .then handler runs after
    // abort and must call `unsub()` immediately so the listener is
    // never attached for longer than the component was mounted.
    let resolveSubscription: ((unsub: () => void) => void) | undefined
    mockWindowApi.onResized.mockImplementation(
      () =>
        new Promise<() => void>(resolve => {
          resolveSubscription = resolve
        })
    )

    const unsub = vi.fn()
    const { unmount } = render(<WindowsWindowControls />)
    unmount()

    // Now Tauri resolves the subscription — the .then handler runs
    // with aborted=true and must call unsub() right away.
    resolveSubscription?.(unsub)
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(unsub).toHaveBeenCalledTimes(1)
  })

  it('cleans up safely when onResized has not resolved before unmount', async () => {
    // Edge case: the cleanup runs while `resolvedUnsub` is still null
    // (onResized never resolved). The cleanup's `if (resolvedUnsub)`
    // must short-circuit so we never call `null()`. There is no
    // observable side effect — we just need unmount to be a no-op.
    mockWindowApi.onResized.mockImplementation(
      () => new Promise<() => void>(() => undefined)
    )

    const { unmount } = render(<WindowsWindowControls />)
    expect(() => unmount()).not.toThrow()
  })
})
