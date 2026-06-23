import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { MacOSWindowControls } from './MacOSWindowControls'

const { mockWindowApi, mockExecuteCommand, mockCommandContext } = vi.hoisted(
  () => ({
    mockWindowApi: {
      close: vi.fn(),
      minimize: vi.fn(),
      toggleMaximize: vi.fn(),
      isFullscreen: vi.fn(),
      onFocusChanged: vi.fn(),
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

describe('MacOSWindowControls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWindowApi.isFullscreen.mockResolvedValue(false)
    mockWindowApi.onFocusChanged.mockResolvedValue(() => undefined)
    mockExecuteCommand.mockResolvedValue({ success: true })
  })

  it('runs window-close command when the close button is clicked', async () => {
    render(<MacOSWindowControls />)
    await fireEvent.click(screen.getByRole('button', { name: 'Close window' }))
    expect(mockExecuteCommand).toHaveBeenCalledWith(
      'window-close',
      mockCommandContext
    )
  })

  it('runs window-minimize command when the minimize button is clicked', async () => {
    render(<MacOSWindowControls />)
    await fireEvent.click(
      screen.getByRole('button', { name: 'Minimize window' })
    )
    expect(mockExecuteCommand).toHaveBeenCalledWith(
      'window-minimize',
      mockCommandContext
    )
  })

  it('enters fullscreen on a plain click of the maximise button', async () => {
    mockWindowApi.isFullscreen.mockResolvedValue(false)
    render(<MacOSWindowControls />)
    await fireEvent.click(
      screen.getByRole('button', { name: 'Enter fullscreen' })
    )
    expect(mockExecuteCommand).toHaveBeenCalledWith(
      'window-fullscreen',
      mockCommandContext
    )
  })

  it('toggles maximise when Alt is held and the user clicks the maximise button', async () => {
    mockWindowApi.isFullscreen.mockResolvedValue(false)
    render(<MacOSWindowControls />)
    fireEvent.keyDown(window, { key: 'Alt' })
    await fireEvent.click(
      screen.getByRole('button', { name: 'Maximize window' })
    )
    fireEvent.keyUp(window, { key: 'Alt' })
    expect(mockExecuteCommand).toHaveBeenCalledWith(
      'window-toggle-maximize',
      mockCommandContext
    )
  })

  it('exits fullscreen when the window is already fullscreen, regardless of Alt', async () => {
    mockWindowApi.isFullscreen.mockResolvedValue(true)
    render(<MacOSWindowControls />)
    fireEvent.keyDown(window, { key: 'Alt' })
    await fireEvent.click(
      screen.getByRole('button', { name: 'Maximize window' })
    )
    fireEvent.keyUp(window, { key: 'Alt' })
    expect(mockExecuteCommand).toHaveBeenCalledWith(
      'window-exit-fullscreen',
      mockCommandContext
    )
  })

  it('falls back to the original click behaviour when isFullscreen throws', async () => {
    mockWindowApi.isFullscreen.mockRejectedValue(new Error('boom'))
    render(<MacOSWindowControls />)
    await fireEvent.click(
      screen.getByRole('button', { name: 'Enter fullscreen' })
    )
    // Without Alt and on failure: enter fullscreen via the command fallback.
    expect(mockExecuteCommand).toHaveBeenCalledWith(
      'window-fullscreen',
      mockCommandContext
    )
  })

  it('falls back to toggle-maximize on Alt-click when isFullscreen throws', async () => {
    mockWindowApi.isFullscreen.mockRejectedValue(new Error('boom'))
    render(<MacOSWindowControls />)
    fireEvent.keyDown(window, { key: 'Alt' })
    await fireEvent.click(
      screen.getByRole('button', { name: 'Maximize window' })
    )
    fireEvent.keyUp(window, { key: 'Alt' })
    expect(mockExecuteCommand).toHaveBeenCalledWith(
      'window-toggle-maximize',
      mockCommandContext
    )
  })

  it('registers and tears down the keydown, keyup, focus and blur listeners', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = render(<MacOSWindowControls />)
    expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
    expect(addSpy).toHaveBeenCalledWith('keyup', expect.any(Function))
    expect(addSpy).toHaveBeenCalledWith('focus', expect.any(Function))
    expect(addSpy).toHaveBeenCalledWith('blur', expect.any(Function))
    unmount()
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('keyup', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('focus', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('blur', expect.any(Function))
  })
})
