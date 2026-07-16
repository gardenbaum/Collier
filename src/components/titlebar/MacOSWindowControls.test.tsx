import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, render, screen, fireEvent } from '@/test/test-utils'
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

  it('renders the close, minimize, and fullscreen icons when the pointer enters the controls', async () => {
    render(<MacOSWindowControls />)
    const container = screen.getByRole('button', {
      name: 'Close window',
    }).parentElement as HTMLElement
    expect(container.querySelectorAll('svg').length).toBe(0)
    await act(async () => {
      fireEvent.mouseEnter(container)
    })
    // Three buttons, each renders one hover icon while hovering.
    expect(container.querySelectorAll('svg').length).toBe(3)
    // Without Alt, the third button shows the fullscreen icon
    // (viewBox "0 0 15 15") rather than maximize ("0 0 17 16").
    const thirdSvg = screen
      .getByRole('button', { name: 'Enter fullscreen' })
      .querySelector('svg')
    expect(thirdSvg?.getAttribute('viewBox')).toBe('0 0 15 15')
  })

  it('removes the hover icons when the pointer leaves the controls', async () => {
    render(<MacOSWindowControls />)
    const container = screen.getByRole('button', {
      name: 'Close window',
    }).parentElement as HTMLElement
    await act(async () => {
      fireEvent.mouseEnter(container)
    })
    expect(container.querySelectorAll('svg').length).toBe(3)
    await act(async () => {
      fireEvent.mouseLeave(container)
    })
    expect(container.querySelectorAll('svg').length).toBe(0)
  })

  it('renders the maximize icon (not fullscreen) on hover when Alt is held', async () => {
    render(<MacOSWindowControls />)
    fireEvent.keyDown(window, { key: 'Alt' })
    const maximizeBtn = screen.getByRole('button', {
      name: 'Maximize window',
    })
    const container = maximizeBtn.parentElement as HTMLElement
    await act(async () => {
      fireEvent.mouseEnter(container)
    })
    const svg = maximizeBtn.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('viewBox')).toBe('0 0 17 16')
    fireEvent.keyUp(window, { key: 'Alt' })
  })

  it('marks the controls as unfocused when the window is blurred', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    render(<MacOSWindowControls />)
    const blurHandler = addSpy.mock.calls.find(
      ([type]) => type === 'blur'
    )?.[1] as (() => void) | undefined
    expect(blurHandler).toBeDefined()
    expect(
      screen.getByRole('button', { name: 'Close window' }).className
    ).toContain('bg-[#ff544d]')
    await act(async () => {
      blurHandler?.()
    })
    expect(
      screen.getByRole('button', { name: 'Close window' }).className
    ).toContain('bg-gray-400')
    addSpy.mockRestore()
  })

  it('marks the controls as focused when the window gains focus', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    render(<MacOSWindowControls />)
    const focusHandler = addSpy.mock.calls.find(
      ([type]) => type === 'focus'
    )?.[1] as (() => void) | undefined
    const blurHandler = addSpy.mock.calls.find(
      ([type]) => type === 'blur'
    )?.[1] as (() => void) | undefined
    expect(focusHandler).toBeDefined()
    expect(blurHandler).toBeDefined()
    await act(async () => {
      blurHandler?.()
    })
    expect(
      screen.getByRole('button', { name: 'Close window' }).className
    ).toContain('bg-gray-400')
    await act(async () => {
      focusHandler?.()
    })
    expect(
      screen.getByRole('button', { name: 'Close window' }).className
    ).toContain('bg-[#ff544d]')
    addSpy.mockRestore()
  })

  it('updates isWindowFocused via the Tauri onFocusChanged callback payload', async () => {
    let captured: ((event: { payload: boolean }) => void) | undefined
    mockWindowApi.onFocusChanged.mockImplementation(handler => {
      captured = handler as (event: { payload: boolean }) => void
      return Promise.resolve(() => undefined)
    })
    render(<MacOSWindowControls />)
    // Flush the microtask queue so setupTauriFocusListener().then(...) has
    // run and the captured handler is the real one from the source.
    await act(async () => {
      await new Promise(resolve => {
        setTimeout(resolve, 0)
      })
    })
    expect(captured).toBeDefined()
    expect(
      screen.getByRole('button', { name: 'Close window' }).className
    ).toContain('bg-[#ff544d]')
    await act(async () => {
      captured?.({ payload: false })
    })
    expect(
      screen.getByRole('button', { name: 'Close window' }).className
    ).toContain('bg-gray-400')
    await act(async () => {
      captured?.({ payload: true })
    })
    expect(
      screen.getByRole('button', { name: 'Close window' }).className
    ).toContain('bg-[#ff544d]')
  })

  it('silently falls back when Tauri onFocusChanged rejects (e.g. outside Tauri)', async () => {
    mockWindowApi.onFocusChanged.mockRejectedValue(
      new Error('not running in Tauri')
    )
    expect(() => render(<MacOSWindowControls />)).not.toThrow()
    await act(async () => {
      await new Promise(resolve => {
        setTimeout(resolve, 0)
      })
    })
    // Default isWindowFocused=true; the rejection path keeps the default
    // (no Tauri payload ever updates the state).
    expect(
      screen.getByRole('button', { name: 'Close window' }).className
    ).toContain('bg-[#ff544d]')
  })

  it('does not toggle the Alt state on unrelated key presses', () => {
    render(<MacOSWindowControls />)
    fireEvent.keyDown(window, { key: 'Shift' })
    expect(
      screen.getByRole('button', { name: 'Enter fullscreen' })
    ).toBeInTheDocument()
    fireEvent.keyUp(window, { key: 'Shift' })
    expect(
      screen.getByRole('button', { name: 'Enter fullscreen' })
    ).toBeInTheDocument()
  })

  it('invokes the Tauri unlisten function on unmount when it resolved', async () => {
    const unlistenMock = vi.fn()
    mockWindowApi.onFocusChanged.mockResolvedValue(unlistenMock)
    const { unmount } = render(<MacOSWindowControls />)
    // Allow the .then(unlisten => { tauriUnlisten = unlisten }) callback to
    // fire before unmounting so the cleanup branch can call it.
    await act(async () => {
      await new Promise(resolve => {
        setTimeout(resolve, 0)
      })
    })
    unmount()
    expect(unlistenMock).toHaveBeenCalledTimes(1)
  })
})
