import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@/test/test-utils'
import { TitleBar } from './TitleBar'
import { useWorkspaceStore } from '@/store/workspace-store'
import type { WorkspaceEntry } from '@/lib/bindings'

const { mockUsePlatform, mockWindowApi, mockListWorkspaces } = vi.hoisted(
  () => ({
    mockUsePlatform: vi.fn<() => 'macos' | 'windows' | 'linux'>(() => 'macos'),
    mockWindowApi: {
      isMaximized: vi.fn().mockResolvedValue(false),
      maximize: vi.fn().mockResolvedValue(undefined),
      unmaximize: vi.fn().mockResolvedValue(undefined),
      onResized: vi.fn().mockResolvedValue(() => undefined),
      onFocusChanged: vi.fn().mockResolvedValue(() => undefined),
      isFullscreen: vi.fn().mockResolvedValue(false),
      close: vi.fn().mockResolvedValue(undefined),
      minimize: vi.fn().mockResolvedValue(undefined),
    },
    mockListWorkspaces: vi.fn(),
  })
)

vi.mock('@/hooks/use-platform', () => ({
  usePlatform: mockUsePlatform,
  useIsMacOS: () => mockUsePlatform() === 'macos',
  useIsWindows: () => mockUsePlatform() === 'windows',
  useIsLinux: () => mockUsePlatform() === 'linux',
}))

// WindowsWindowControls / MacOSWindowControls call getCurrentWindow() inside
// useEffect — mock the Tauri API so rendering any platform branch succeeds
// without touching the real (non-Tauri) test environment.
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => mockWindowApi),
}))

// WorkspaceSwitcher calls `commands.listWorkspaces` via TanStack
// Query. Default: return a single current-workspace entry that
// matches whatever the test sets `repoPath` to. Individual tests
// override this with `mockListWorkspaces.mockResolvedValueOnce`.
vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    listWorkspaces: mockListWorkspaces,
  },
}))

function makeEntry(
  path: string,
  source: 'current' | 'recent' | 'registry',
  exists = true
): WorkspaceEntry {
  const parts = path.split('/').filter(Boolean)
  return {
    path,
    name: parts[parts.length - 1] ?? path,
    source,
    exists,
  }
}

describe('TitleBar', () => {
  beforeEach(() => {
    mockUsePlatform.mockReset()
    mockUsePlatform.mockReturnValue('macos')
    useWorkspaceStore.setState({ repoPath: null })
    mockListWorkspaces.mockReset()
  })

  it('renders the macOS layout with traffic lights when platform is macOS', () => {
    mockUsePlatform.mockReturnValue('macos')
    render(<TitleBar title="My App" />)
    // macOS title bar has the monogram, title and a close window button
    expect(screen.getByText('My App')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Close window' })
    ).toBeInTheDocument()
  })

  it('renders the Linux toolbar when platform is linux (native decorations path)', () => {
    mockUsePlatform.mockReturnValue('linux')
    render(<TitleBar title="Linux Build" />)
    // The linux variant still shows the title text but does NOT render the macOS
    // traffic-light close button — that's the behaviour we assert.
    expect(screen.getByText('Linux Build')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Close window' })
    ).not.toBeInTheDocument()
  })

  it('renders the Windows layout with right-aligned window controls when platform is windows', () => {
    mockUsePlatform.mockReturnValue('windows')
    render(<TitleBar title="Windows Build" />)
    expect(screen.getByText('Windows Build')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Close window' })
    ).toBeInTheDocument()
  })

  it('honours the forcePlatform prop in dev builds', () => {
    // Even though detection returns macOS, forcing linux overrides it.
    mockUsePlatform.mockReturnValue('macos')
    render(<TitleBar title="Forced" forcePlatform="linux" />)
    expect(screen.getByText('Forced')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Close window' })
    ).not.toBeInTheDocument()
  })

  it('falls back to the default translation key when no title prop is provided', () => {
    mockUsePlatform.mockReturnValue('macos')
    render(<TitleBar />)
    // The default translation key is "titlebar.default" — render must not throw
    // and must produce the title region of the title bar.
    expect(screen.getByTestId('titlebar-monogram')).toBeInTheDocument()
  })

  it('renders the WorkspaceSwitcher trigger in the left actions', () => {
    // M4: the workspace name lives in a dropdown trigger in the
    // left actions, not as a static badge next to the title.
    mockUsePlatform.mockReturnValue('macos')
    useWorkspaceStore.setState({ repoPath: '/Users/dev/projects/collier' })
    mockListWorkspaces.mockResolvedValue({
      status: 'ok',
      data: [makeEntry('/Users/dev/projects/collier', 'current')],
    })
    render(<TitleBar title="Collier" />)
    expect(screen.getByTestId('workspace-switcher-trigger')).toBeInTheDocument()
    // The old static `titlebar-workspace` badge is gone.
    expect(screen.queryByTestId('titlebar-workspace')).not.toBeInTheDocument()
  })

  it('shows the workspace basename on the switcher trigger when a workspace is open', async () => {
    mockUsePlatform.mockReturnValue('macos')
    useWorkspaceStore.setState({ repoPath: '/Users/dev/projects/collier' })
    mockListWorkspaces.mockResolvedValue({
      status: 'ok',
      data: [makeEntry('/Users/dev/projects/collier', 'current')],
    })
    render(<TitleBar title="Collier" />)
    // The trigger renders the workspace name; we wait for the
    // TanStack Query to resolve and the React commit to land.
    expect(await screen.findByText('collier')).toBeInTheDocument()
  })

  it('falls back to the no-workspace label when no workspace is set', () => {
    mockUsePlatform.mockReturnValue('macos')
    useWorkspaceStore.setState({ repoPath: null })
    mockListWorkspaces.mockResolvedValue({ status: 'ok', data: [] })
    render(<TitleBar title="Collier" />)
    // The trigger shows the i18n default ("No workspace" in en).
    expect(screen.getByTestId('workspace-switcher-trigger')).toBeInTheDocument()
  })
})
