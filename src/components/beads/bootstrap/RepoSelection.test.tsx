import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor, act } from '@/test/test-utils'
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

  it('treats a structured getCurrentDir IPC error as "not a repo"', async () => {
    // The getCurrentDir command can fail with a structured IPC error
    // (rather than a thrown exception). The component must set
    // cwdStatus to 'not-a-repo' and skip detectBd/loadPreferences
    // entirely — no logger.error, because the failure is a normal
    // IPC result, not a thrown exception.
    mockedGetCurrentDir.mockResolvedValue({
      status: 'error',
      error: 'no cwd',
    })

    render(<RepoSelection onSelect={onSelectMock} />)

    // The "Use CWD" button must NOT render when the CWD probe failed
    await waitFor(() => {
      expect(screen.queryByTestId('use-cwd-button')).not.toBeInTheDocument()
    })

    // Structured IPC errors are not thrown, so logger.error (which
    // only catches throw/reject from the probe promise chain) must
    // not be invoked.
    expect(mockedLoggerError).not.toHaveBeenCalled()

    // detectBd/loadPreferences must NOT be called once getCurrentDir
    // returned a non-ok result — the probe returns early.
    expect(mockedDetectBd).not.toHaveBeenCalled()
    expect(mockedLoadPreferences).not.toHaveBeenCalled()
  })

  it('shows the empty-state when loadPreferences returns a non-ok status', async () => {
    // Even when the CWD probe succeeds, loadPreferences may fail.
    // recentRepos must stay at its default [] — never crash, never
    // overwrite with undefined data.
    mockedLoadPreferences.mockResolvedValue({
      status: 'error',
      error: { type: 'IoError', message: 'disk full' },
    })

    render(<RepoSelection onSelect={onSelectMock} />)

    // CWD link still renders (default CWD probe succeeds)
    await screen.findByTestId('use-cwd-button')

    // Recent list defaults to empty; the "no recents" message shows.
    expect(
      await screen.findByText(/no recent repositories yet/i)
    ).toBeInTheDocument()

    // No rows from a recents list, no crash on data access.
    expect(screen.queryByTestId(/^recent-repo-/)).not.toBeInTheDocument()
  })

  it('uses an empty array when recent_repos is absent in prefs', async () => {
    // The `recent_repos ?? []` short-circuit on line 53 must run when
    // prefs load successfully but the field is absent (older prefs
    // files written before this field existed still deserialize via
    // `#[serde(default)]` and the field reads as undefined). Without
    // the fallback the render would crash on `.map`.
    mockedLoadPreferences.mockResolvedValue({
      status: 'ok',
      data: {
        theme: 'system',
        quick_pane_shortcut: null,
        language: null,
      },
    })

    render(<RepoSelection onSelect={onSelectMock} />)

    // No crash; the "no recents" empty-state message renders.
    expect(
      await screen.findByText(/no recent repositories yet/i)
    ).toBeInTheDocument()
    expect(screen.queryByTestId(/^recent-repo-/)).not.toBeInTheDocument()
  })

  it('ignores late getCurrentDir resolution after unmount (Branch A)', async () => {
    // The component unmounts between mount and the getCurrentDir
    // promise resolving. The cancelled guard must short-circuit
    // before any setState fires.
    let resolveGetCurrentDir!: (v: { status: 'ok'; data: string }) => void
    mockedGetCurrentDir.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveGetCurrentDir = resolve
        })
    )

    const { unmount } = render(<RepoSelection onSelect={onSelectMock} />)
    unmount()

    // Resolve after unmount — the cancelled flag must swallow it.
    // No logger.error, no console warning about setting state on an
    // unmounted component.
    await act(async () => {
      resolveGetCurrentDir({ status: 'ok', data: '/late/cwd' })
    })

    // detectBd/loadPreferences never reached.
    expect(mockedDetectBd).not.toHaveBeenCalled()
    expect(mockedLoadPreferences).not.toHaveBeenCalled()
    // Probe never rejected; the cancelled guard returns before any
    // setState, so the .catch handler doesn't fire either.
    expect(mockedLoggerError).not.toHaveBeenCalled()
  })

  it('ignores late detectBd resolution after unmount (Branch C)', async () => {
    // Second unmount-race window: component unmounts after
    // getCurrentDir resolves but before detectBd does.
    let resolveDetectBd!: (v: {
      status: 'ok'
      data: {
        version: [number, number, number] | null
        schema_version: number | null
        jsonl_path: string | null
        backend: 'jsonl'
      }
    }) => void
    mockedDetectBd.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveDetectBd = resolve
        })
    )

    const { unmount } = render(<RepoSelection onSelect={onSelectMock} />)
    // Wait for getCurrentDir to settle so we're past line 38/39-41
    await waitFor(() => {
      expect(mockedDetectBd).toHaveBeenCalled()
    })
    unmount()

    await act(async () => {
      resolveDetectBd({
        status: 'ok',
        data: {
          version: [1, 0, 5],
          schema_version: 1,
          jsonl_path: null,
          backend: 'jsonl',
        },
      })
    })

    // loadPreferences must NOT be reached after unmount.
    expect(mockedLoadPreferences).not.toHaveBeenCalled()
    expect(mockedLoggerError).not.toHaveBeenCalled()
  })

  it('ignores late loadPreferences resolution after unmount (Branch D)', async () => {
    // Third unmount-race window: component unmounts after both
    // getCurrentDir and detectBd resolve but before loadPreferences.
    let resolveLoadPreferences!: (v: {
      status: 'ok'
      data: {
        theme: 'system'
        quick_pane_shortcut: null
        language: null
        recent_repos: string[]
      }
    }) => void
    mockedLoadPreferences.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveLoadPreferences = resolve
        })
    )

    const { unmount } = render(<RepoSelection onSelect={onSelectMock} />)
    // Wait for detectBd to settle so we're past line 47.
    await waitFor(() => {
      expect(mockedLoadPreferences).toHaveBeenCalled()
    })
    unmount()

    await act(async () => {
      resolveLoadPreferences({
        status: 'ok',
        data: {
          theme: 'system',
          quick_pane_shortcut: null,
          language: null,
          recent_repos: ['/late/repo'],
        },
      })
    })

    // recentRepos must remain empty in the React state of the
    // unmounted component (no setState happens). The rendered output
    // is already torn down by unmount, so we just assert no logger
    // error and no surprise setRecentRepo.
    expect(mockedLoggerError).not.toHaveBeenCalled()
  })

  // ─────────────────────────────────────────────────────────────────
  // The two `if (busy) return` re-entrancy guards in handleSelect (L66)
  // and handlePickFolder (L80) are unreachable through any DOM-level
  // API: every action button renders `disabled={busy}`, and React 19's
  // synthetic event dispatcher short-circuits click handlers on
  // disabled buttons regardless of whether we dispatch via
  // `userEvent`, `fireEvent`, `dispatchEvent`, or strip the attribute
  // ourselves. The guards exist as defense-in-depth (e.g. against a
  // future refactor that drops the `disabled` prop) but cannot be
  // exercised without source changes. Per the realistic-ceiling
  // guidance for shadcn-style primitives, the unreachable branch
  // bodies on L66 and L80 are documented here rather than tested via
  // fragile `vi.spyOn`/fiber-internals hacks.
  // ─────────────────────────────────────────────────────────────────
})
