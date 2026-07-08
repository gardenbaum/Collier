import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@/test/test-utils'
import { userEvent } from '@testing-library/user-event'
import { commands } from '@/lib/tauri-bindings'

// Mock the tauri dialog plugin (file picker)
const openMock = vi.fn()
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: (...args: unknown[]) => openMock(...args),
}))

// Mock the typed tauri bindings for the repo-selection flow
vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    detectBd: vi.fn(),
    addRecentRepo: vi.fn(),
    loadPreferences: vi.fn(),
    savePreferences: vi.fn(),
    getCurrentDir: vi.fn(),
  },
  unwrapResult: (result: { status: string; data?: unknown }) => {
    if (result.status === 'ok') return result.data
    throw result
  },
}))

// Mock the logger so we can assert that bootstrap failures route
// through the shared logger (which mirrors warn/error to the
// on-disk diagnostic log in prod when "Enable diagnostic logging"
// is on in Advanced preferences). The mocks live in `vi.hoisted`
// so they exist before `vi.mock` factory bodies run.
const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  },
}))
vi.mock('@/lib/logger', () => ({
  logger: mockLogger,
}))

// Capture onSelect so tests can assert it fired with the right path
const onSelectMock = vi.fn()

const mockedDetectBd = vi.mocked(commands.detectBd)
const mockedAddRecentRepo = vi.mocked(commands.addRecentRepo)
const mockedLoadPreferences = vi.mocked(commands.loadPreferences)
const mockedGetCurrentDir = vi.mocked(commands.getCurrentDir)

const mockedLoggerError = vi.mocked(mockLogger.error)
const mockedLoggerWarn = vi.mocked(mockLogger.warn)

import { RepoSelection } from './RepoSelection'

beforeEach(() => {
  vi.clearAllMocks()
  onSelectMock.mockReset()

  // Default mocks: empty recents, CWD = /test/cwd, CWD IS a valid repo
  mockedGetCurrentDir.mockResolvedValue({
    status: 'ok',
    data: '/test/cwd',
  })
  mockedDetectBd.mockResolvedValue({
    status: 'ok',
    data: {
      version: [1, 0, 5],
      schema_version: 1,
      jsonl_path: null,
      backend: 'jsonl',
    },
  })
  mockedLoadPreferences.mockResolvedValue({
    status: 'ok',
    data: {
      theme: 'system',
      quick_pane_shortcut: null,
      language: null,
      recent_repos: [],
    },
  })
  mockedAddRecentRepo.mockResolvedValue({ status: 'ok', data: null })
})

describe('RepoSelection', () => {
  it('renders the bootstrap screen with a file picker', async () => {
    render(<RepoSelection onSelect={onSelectMock} />)

    // The picker button is always rendered (the CWD button is conditional)
    expect(await screen.findByTestId('repo-picker-button')).toBeInTheDocument()
  })

  it('uses CWD when it is already a valid repo', async () => {
    render(<RepoSelection onSelect={onSelectMock} />)

    const cwdLink = await screen.findByTestId('use-cwd-button')
    const user = userEvent.setup()
    await user.click(cwdLink)

    // Recent repo gets recorded and onSelect fires with the CWD path
    await waitFor(() => {
      expect(mockedAddRecentRepo).toHaveBeenCalledWith('/test/cwd')
    })
    expect(onSelectMock).toHaveBeenCalledWith('/test/cwd')
  })

  it('hides the "Use CWD" link when CWD is not a valid repo', async () => {
    mockedDetectBd.mockResolvedValue({
      status: 'error',
      error: { type: 'NotARepo', path: '/test/cwd' },
    })

    render(<RepoSelection onSelect={onSelectMock} />)

    // Wait for the CWD probe to settle
    await waitFor(() => {
      expect(mockedDetectBd).toHaveBeenCalledWith('/test/cwd')
    })

    // No "Use CWD" link when the probe failed
    expect(screen.queryByTestId('use-cwd-button')).not.toBeInTheDocument()
  })

  it('recent click selects the path', async () => {
    mockedLoadPreferences.mockResolvedValue({
      status: 'ok',
      data: {
        theme: 'system',
        quick_pane_shortcut: null,
        language: null,
        recent_repos: ['/path/to/recent', '/other/repo'],
      },
    })

    render(<RepoSelection onSelect={onSelectMock} />)

    // The first recent path should appear as a clickable row
    const recentButton = await screen.findByTestId(
      'recent-repo-/path/to/recent'
    )
    const user = userEvent.setup()
    await user.click(recentButton)

    expect(mockedAddRecentRepo).toHaveBeenCalledWith('/path/to/recent')
    expect(onSelectMock).toHaveBeenCalledWith('/path/to/recent')
  })

  it('shows a "no recents" message when the list is empty', async () => {
    render(<RepoSelection onSelect={onSelectMock} />)

    // The translated empty-state message appears
    expect(
      await screen.findByText(/no recent repositories yet/i)
    ).toBeInTheDocument()
  })

  it('file picker button triggers the native open() dialog', async () => {
    openMock.mockResolvedValue('/picked/repo')

    render(<RepoSelection onSelect={onSelectMock} />)

    const pickerButton = await screen.findByTestId('repo-picker-button')
    const user = userEvent.setup()
    await user.click(pickerButton)

    await waitFor(() => {
      expect(openMock).toHaveBeenCalled()
    })

    // open() was called with the right options
    expect(openMock).toHaveBeenCalledWith({
      directory: true,
      multiple: false,
    })

    // The picked path is recorded and onSelect fires
    await waitFor(() => {
      expect(mockedAddRecentRepo).toHaveBeenCalledWith('/picked/repo')
    })
    expect(onSelectMock).toHaveBeenCalledWith('/picked/repo')
  })

  it('does not select anything if the user cancels the file picker', async () => {
    openMock.mockResolvedValue(null)

    render(<RepoSelection onSelect={onSelectMock} />)

    const pickerButton = await screen.findByTestId('repo-picker-button')
    const user = userEvent.setup()
    await user.click(pickerButton)

    await waitFor(() => {
      expect(openMock).toHaveBeenCalled()
    })

    expect(mockedAddRecentRepo).not.toHaveBeenCalled()
    expect(onSelectMock).not.toHaveBeenCalled()
  })

  it('routes bootstrap probe failures through logger.error', async () => {
    // Force getCurrentDir to reject so probe() throws and lands
    // in its .catch() handler.
    mockedGetCurrentDir.mockRejectedValue(new Error('boom'))

    render(<RepoSelection onSelect={onSelectMock} />)

    await waitFor(() => {
      expect(mockedLoggerError).toHaveBeenCalledWith(
        'RepoSelection probe failed',
        expect.objectContaining({ error: expect.any(Error) })
      )
    })
  })

  it('routes addRecentRepo failures through logger.warn', async () => {
    mockedAddRecentRepo.mockResolvedValue({
      status: 'error',
      error: 'disk full',
    })

    render(<RepoSelection onSelect={onSelectMock} />)

    // The "Use CWD" link only appears when the probe succeeds; the
    // default mock makes that the case, so click it to exercise
    // the handleSelect path.
    const cwdLink = await screen.findByTestId('use-cwd-button')
    const user = userEvent.setup()
    await user.click(cwdLink)

    await waitFor(() => {
      expect(mockedLoggerWarn).toHaveBeenCalledWith(
        'addRecentRepo failed',
        expect.objectContaining({
          error: 'disk full',
        })
      )
    })
  })
})
