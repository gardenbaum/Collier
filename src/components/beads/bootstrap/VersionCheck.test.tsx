/**
 * Tests for the VersionCheck bootstrap modal.
 *
 * Contract: when `commands.detectBd(cwd)` returns a BdInfo with
 * `version[0] !== 1` (e.g. 2.5.0), the modal renders and blocks
 * the app. It offers two actions:
 *   - "Update Beads" — opens https://github.com/gastownhall/beads/releases in a new tab
 *   - "Quit"        — closes the Tauri window
 *
 * When the version is 1.x (supported) or `version === null`, the
 * component calls `onPass()` silently and renders nothing.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { render } from '@/test/test-utils'

// React 19 + Vitest: silence "act() not configured" warnings.
;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

// Hoisted mocks — must be declared before the import of the SUT.
const { mockDetectBd, mockClose, mockLoggerDebug, mockLoggerError } =
  vi.hoisted(() => ({
    mockDetectBd: vi.fn(),
    mockClose: vi.fn(),
    mockLoggerDebug: vi.fn(),
    mockLoggerError: vi.fn(),
  }))

vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    detectBd: mockDetectBd,
  },
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    close: mockClose,
  }),
}))

// Logger noise reduction — debug/error captured for assertion.
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: mockLoggerDebug,
    info: vi.fn(),
    warn: vi.fn(),
    error: mockLoggerError,
  },
}))

// Lazy import so the mocks above are wired before the SUT is evaluated.
const importSut = () => import('./VersionCheck')

beforeEach(() => {
  vi.clearAllMocks()
  mockClose.mockResolvedValue(undefined)
})

const CWD = '/Users/test/repo'

const unsupportedBdInfo = {
  version: [2, 5, 0] as [number, number, number],
  schema_version: 1,
  backend: 'jsonl' as const,
  jsonl_path: '.beads/x.jsonl',
}

const supportedBdInfo = {
  version: [1, 0, 5] as [number, number, number],
  schema_version: 1,
  backend: 'jsonl' as const,
  jsonl_path: '.beads/x.jsonl',
}

// `bd` is installed but didn't report a parseable version (e.g. `bd --version`
// returned something unexpected). The component must pass through without
// showing the modal — a null version is treated as "supported" (we can't
// prove the user is on an unsupported major, so don't block the app).
const nullVersionBdInfo = {
  version: null,
  schema_version: 1,
  backend: 'jsonl' as const,
  jsonl_path: '.beads/x.jsonl',
}

describe('VersionCheck modal', () => {
  it('unsupported: renders modal with correct link href', async () => {
    mockDetectBd.mockResolvedValue({
      status: 'ok',
      data: unsupportedBdInfo,
    })

    const { VersionCheck } = await importSut()
    render(<VersionCheck cwd={CWD} onPass={vi.fn()} />)

    await waitFor(() => {
      expect(mockDetectBd).toHaveBeenCalledWith(CWD)
    })

    // Modal is in the document
    expect(screen.getByTestId('version-check-modal')).toBeInTheDocument()

    // Update Beads link has correct href
    const link = screen.getByTestId('update-beads-link') as HTMLAnchorElement
    expect(link.href).toBe('https://github.com/gastownhall/beads/releases')
    expect(link.target).toBe('_blank')
    expect(link.rel).toBe('noopener noreferrer')

    // Quit button present
    expect(screen.getByRole('button', { name: /quit/i })).toBeInTheDocument()
  })

  it('supported: does not render modal and calls onPass', async () => {
    const onPass = vi.fn()
    mockDetectBd.mockResolvedValue({
      status: 'ok',
      data: supportedBdInfo,
    })

    const { VersionCheck } = await importSut()
    render(<VersionCheck cwd={CWD} onPass={onPass} />)

    await waitFor(() => {
      expect(mockDetectBd).toHaveBeenCalledWith(CWD)
    })

    // Modal is NOT in the document
    expect(screen.queryByTestId('version-check-modal')).not.toBeInTheDocument()

    // onPass was called
    expect(onPass).toHaveBeenCalledTimes(1)
  })

  it('null version: passes through without modal (covers isSupportedVersion L43)', async () => {
    const onPass = vi.fn()
    mockDetectBd.mockResolvedValue({
      status: 'ok',
      data: nullVersionBdInfo,
    })

    const { VersionCheck } = await importSut()
    render(<VersionCheck cwd={CWD} onPass={onPass} />)

    await waitFor(() => {
      expect(mockDetectBd).toHaveBeenCalledWith(CWD)
    })

    // Modal is NOT in the document — null version is treated as supported
    expect(screen.queryByTestId('version-check-modal')).not.toBeInTheDocument()

    // onPass was called exactly once
    expect(onPass).toHaveBeenCalledTimes(1)
  })

  it('error status: passes through with logger.debug (covers L70, L72-L78)', async () => {
    const onPass = vi.fn()
    mockDetectBd.mockResolvedValue({
      status: 'error',
      error: 'bd: command not found on PATH',
    })

    const { VersionCheck } = await importSut()
    render(<VersionCheck cwd={CWD} onPass={onPass} />)

    await waitFor(() => {
      expect(mockDetectBd).toHaveBeenCalledWith(CWD)
    })

    // Modal is NOT in the document — detect errors are non-blocking
    expect(screen.queryByTestId('version-check-modal')).not.toBeInTheDocument()

    // onPass was called (error path treats "can't detect" as pass-through)
    expect(onPass).toHaveBeenCalledTimes(1)

    // logger.debug captures the diagnostic with the error message and cwd
    expect(mockLoggerDebug).toHaveBeenCalledWith(
      'detectBd error during version check',
      expect.objectContaining({
        error: 'bd: command not found on PATH',
        cwd: CWD,
      })
    )
  })

  it('rejection: passes through with logger.error (covers catch L89-L93)', async () => {
    const onPass = vi.fn()
    const boom = new Error('invoke("detect_bd") failed')
    mockDetectBd.mockRejectedValue(boom)

    const { VersionCheck } = await importSut()
    render(<VersionCheck cwd={CWD} onPass={onPass} />)

    await waitFor(() => {
      expect(mockDetectBd).toHaveBeenCalledWith(CWD)
    })

    // Modal is NOT in the document — defensive pass-through on throw
    expect(screen.queryByTestId('version-check-modal')).not.toBeInTheDocument()

    // onPass was called (catch path also treats throw as pass-through)
    expect(onPass).toHaveBeenCalledTimes(1)

    // logger.error captures the throw with the original error and cwd
    expect(mockLoggerError).toHaveBeenCalledWith(
      'detectBd threw during version check',
      expect.objectContaining({
        err: boom,
        cwd: CWD,
      })
    )
  })

  it('unmount before settle: both .then and .catch short-circuit via cancelled flag (covers L69, L89)', async () => {
    // First mount: unmount, then REJECT — exercises the cancelled guard
    // inside the .catch block (L89 true branch).
    let rejectDetect!: (reason: unknown) => void
    mockDetectBd.mockImplementationOnce(
      () =>
        new Promise((_res, rej) => {
          rejectDetect = rej
        })
    )
    const onPassReject = vi.fn()
    const { VersionCheck } = await importSut()
    const { unmount: unmountReject } = render(
      <VersionCheck cwd={CWD} onPass={onPassReject} />
    )
    unmountReject()
    rejectDetect(new Error('late failure after unmount'))
    // Drain microtasks so the rejected promise's .catch handler runs.
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(onPassReject).not.toHaveBeenCalled()

    // Second mount: unmount, then RESOLVE — exercises the cancelled guard
    // inside the .then block (L69 true branch). Fresh promise so the
    // previous rejection doesn't suppress this one.
    let resolveDetect!: (value: { status: string; data: unknown }) => void
    mockDetectBd.mockImplementationOnce(
      () =>
        new Promise(res => {
          resolveDetect = res
        })
    )
    const onPassResolve = vi.fn()
    const { unmount: unmountResolve } = render(
      <VersionCheck cwd={CWD} onPass={onPassResolve} />
    )
    unmountResolve()
    resolveDetect({ status: 'ok', data: supportedBdInfo })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(onPassResolve).not.toHaveBeenCalled()
  })
})
