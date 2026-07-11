/**
 * Tests for `MainWindow` — the top-level application shell after the
 * bootstrap flow has selected a workspace.
 *
 * Contract covered here:
 *   1. Sidebar panel + resize handle hide when `sidebarVisible=false`.
 *   2. Sidebar panel + resize handle stay visible when `sidebarVisible=true`.
 *   3. A non-null `repoPath` attaches the Rust filesystem watcher.
 *   4. A null `repoPath` skips watcher attachment.
 *   5. Watcher attach rejection is swallowed and logged via `logger.warn`.
 *   6. Changing `repoPath` re-runs the effect for the new repository.
 *   7. `useMainWindowEventListeners()` is invoked on render.
 *   8. Sonner `Toaster` receives the dark/light/system theme mapping.
 *   9. The shell renders the heavy child regions (stubbed here so this
 *      suite stays focused on MainWindow's wiring rather than their
 *      dependency trees).
 */
import type { ReactNode } from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'

interface MockResizablePanelGroupProps {
  children?: ReactNode
  className?: string
  direction?: string
}

interface MockResizablePanelProps {
  children?: ReactNode
  className?: string
  defaultSize?: number
  minSize?: number
  maxSize?: number
}

interface MockResizableHandleProps {
  className?: string
}

interface MockToasterProps {
  theme?: string
  position?: string
  className?: string
  toastOptions?: unknown
}

interface MockUIState {
  sidebarVisible: boolean
}

interface MockWorkspaceState {
  repoPath: string | null
}

// React 19 + Vitest: silence "act() not configured" warnings.
;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const {
  mockAttachWatchRepo,
  mockDetachWatchRepo,
  mockWarn,
  mockUseMainWindowEventListeners,
  mockUseTheme,
  mockUseUIStore,
  mockUseWorkspaceStore,
  setMockSidebarVisible,
  setMockRepoPath,
  resetMockStores,
  mockTitleBar,
  mockSidebar,
  mockMainWindowContent,
  mockCommandPalette,
  mockPreferencesDialog,
  mockToaster,
} = vi.hoisted(() => {
  let sidebarVisible = true
  let repoPath: string | null = null

  return {
    mockAttachWatchRepo: vi.fn(),
    mockDetachWatchRepo: vi.fn(),
    mockWarn: vi.fn(),
    mockUseMainWindowEventListeners: vi.fn(),
    mockUseTheme: vi.fn(() => ({ theme: 'light' })),
    mockUseUIStore: vi.fn((selector: (state: MockUIState) => unknown) =>
      selector({ sidebarVisible })
    ),
    mockUseWorkspaceStore: vi.fn(
      (selector: (state: MockWorkspaceState) => unknown) =>
        selector({ repoPath })
    ),
    setMockSidebarVisible: (visible: boolean) => {
      sidebarVisible = visible
    },
    setMockRepoPath: (path: string | null) => {
      repoPath = path
    },
    resetMockStores: () => {
      sidebarVisible = true
      repoPath = null
    },
    mockTitleBar: vi.fn(() => <div data-testid="mock-title-bar" />),
    mockSidebar: vi.fn(() => <div data-testid="mock-sidebar" />),
    mockMainWindowContent: vi.fn(() => (
      <div data-testid="mock-main-window-content" />
    )),
    mockCommandPalette: vi.fn(() => <div data-testid="mock-command-palette" />),
    mockPreferencesDialog: vi.fn(() => (
      <div data-testid="mock-preferences-dialog" />
    )),
    mockToaster: vi.fn(({ theme }: MockToasterProps) => (
      <div data-testid="mock-toaster" data-theme={theme} />
    )),
  }
})

vi.mock('@/components/ui/resizable', () => ({
  ResizablePanelGroup: ({
    children,
    className,
    direction,
  }: MockResizablePanelGroupProps) => (
    <div
      data-testid="resizable-panel-group"
      data-direction={direction}
      className={className}
    >
      {children}
    </div>
  ),
  ResizablePanel: ({
    children,
    className,
    defaultSize,
    minSize,
    maxSize,
  }: MockResizablePanelProps) => (
    <div
      data-testid="resizable-panel"
      data-default-size={defaultSize}
      data-min-size={minSize}
      data-max-size={maxSize}
      className={className}
    >
      {children}
    </div>
  ),
  ResizableHandle: ({ className }: MockResizableHandleProps) => (
    <div data-testid="resizable-handle" className={className} />
  ),
}))

vi.mock('@/components/titlebar/TitleBar', () => ({
  TitleBar: mockTitleBar,
}))

vi.mock('@/components/layout/Sidebar', () => ({
  Sidebar: mockSidebar,
}))

vi.mock('@/components/layout/MainWindowContent', () => ({
  MainWindowContent: mockMainWindowContent,
}))

vi.mock('@/components/command-palette/CommandPalette', () => ({
  CommandPalette: mockCommandPalette,
}))

vi.mock('@/components/preferences/PreferencesDialog', () => ({
  PreferencesDialog: mockPreferencesDialog,
}))

vi.mock('sonner', () => ({
  Toaster: mockToaster,
}))

vi.mock('@/hooks/use-theme', () => ({
  useTheme: mockUseTheme,
}))

vi.mock('@/store/ui-store', () => ({
  useUIStore: mockUseUIStore,
}))

vi.mock('@/store/workspace-store', () => ({
  useWorkspaceStore: mockUseWorkspaceStore,
}))

vi.mock('@/hooks/useMainWindowEventListeners', () => ({
  useMainWindowEventListeners: mockUseMainWindowEventListeners,
}))

vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    attachWatchRepo: mockAttachWatchRepo,
    detachWatchRepo: mockDetachWatchRepo,
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: mockWarn,
    error: vi.fn(),
  },
}))

import { MainWindow } from './MainWindow'

const resetStores = () => {
  resetMockStores()
}

const flushEffects = async () => {
  await act(async () => {
    await Promise.resolve()
  })
}

const getSidebarPanel = () => {
  const panel = screen
    .getByTestId('mock-sidebar')
    .closest('[data-testid="resizable-panel"]')
  if (panel === null) throw new Error('sidebar panel was not rendered')
  return panel
}

beforeEach(() => {
  vi.clearAllMocks()
  resetStores()
  mockUseTheme.mockReturnValue({ theme: 'light' })
  mockAttachWatchRepo.mockResolvedValue(undefined)
})

describe('MainWindow — shell rendering', () => {
  it('renders the app shell children and invokes the main-window event listener hook', () => {
    render(<MainWindow />)

    expect(screen.getByTestId('mock-title-bar')).toBeInTheDocument()
    expect(screen.getByTestId('mock-sidebar')).toBeInTheDocument()
    expect(screen.getByTestId('mock-main-window-content')).toBeInTheDocument()
    expect(screen.getByTestId('mock-command-palette')).toBeInTheDocument()
    expect(screen.getByTestId('mock-preferences-dialog')).toBeInTheDocument()
    expect(screen.getByTestId('mock-toaster')).toBeInTheDocument()
    expect(mockUseMainWindowEventListeners).toHaveBeenCalledTimes(1)
  })
})

describe('MainWindow — sidebar visibility wiring', () => {
  it('adds the hidden class to the sidebar panel and resize handle when sidebarVisible=false', () => {
    setMockSidebarVisible(false)

    render(<MainWindow />)

    expect(getSidebarPanel()).toHaveClass('hidden')
    expect(screen.getByTestId('resizable-handle')).toHaveClass('hidden')
  })

  it('does not add the hidden class to the sidebar panel or resize handle when sidebarVisible=true', () => {
    setMockSidebarVisible(true)

    render(<MainWindow />)

    expect(getSidebarPanel()).not.toHaveClass('hidden')
    expect(screen.getByTestId('resizable-handle')).not.toHaveClass('hidden')
  })
})

describe('MainWindow — repository watcher attachment', () => {
  it('calls commands.attachWatchRepo(repoPath) when repoPath is set', async () => {
    setMockRepoPath('/tmp/collier-repo')

    render(<MainWindow />)

    await waitFor(() => {
      expect(mockAttachWatchRepo).toHaveBeenCalledWith('/tmp/collier-repo')
    })
  })

  it('does not call commands.attachWatchRepo when repoPath is null', async () => {
    render(<MainWindow />)

    await flushEffects()

    expect(mockAttachWatchRepo).not.toHaveBeenCalled()
  })

  it('logs and swallows attachWatchRepo rejections', async () => {
    const err = new Error('watcher unavailable')
    mockAttachWatchRepo.mockRejectedValueOnce(err)
    setMockRepoPath('/tmp/broken-repo')

    render(<MainWindow />)

    await waitFor(() => {
      expect(mockWarn).toHaveBeenCalledWith('Failed to attach watcher', { err })
    })
  })

  it('re-runs the effect when repoPath changes', async () => {
    setMockRepoPath('/tmp/first-repo')

    const { rerender } = render(<MainWindow />)

    await waitFor(() => {
      expect(mockAttachWatchRepo).toHaveBeenCalledWith('/tmp/first-repo')
    })

    act(() => {
      setMockRepoPath('/tmp/second-repo')
    })
    rerender(<MainWindow />)

    await waitFor(() => {
      expect(mockAttachWatchRepo).toHaveBeenCalledTimes(2)
      expect(mockAttachWatchRepo).toHaveBeenLastCalledWith('/tmp/second-repo')
    })
  })
})

describe('MainWindow — toaster theme mapping', () => {
  it.each([
    { hookTheme: 'dark', toasterTheme: 'dark' },
    { hookTheme: 'light', toasterTheme: 'light' },
    { hookTheme: 'system', toasterTheme: 'system' },
    { hookTheme: 'sepia', toasterTheme: 'system' },
  ])(
    'maps useTheme().theme=$hookTheme to Toaster theme=$toasterTheme',
    ({ hookTheme, toasterTheme }) => {
      mockUseTheme.mockReturnValue({ theme: hookTheme })

      render(<MainWindow />)

      expect(screen.getByTestId('mock-toaster')).toHaveAttribute(
        'data-theme',
        toasterTheme
      )
      expect(mockToaster).toHaveBeenCalledWith(
        expect.objectContaining({ theme: toasterTheme }),
        undefined
      )
    }
  )
})
