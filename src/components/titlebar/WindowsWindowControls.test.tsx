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
})
