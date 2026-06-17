/**
 * Tests for the BdInitFlow bootstrap panel.
 *
 * Contract: when `commands.detectBd(cwd)` succeeds but `jsonl_path` is
 * `None` and `backend === "unknown"` (no `.beads/` dir), the parent
 * (App.tsx, Wave 8) renders this panel. The panel offers two actions:
 *   - "Initialize" — invokes `commands.runBdCommand(["init"], repoPath)`,
 *     refetches via `commands.detectBd(cwd)`, and on success calls
 *     `onInitialized()`. On failure shows a Sonner toast with the
 *     stderr from `BdError::NonZeroExit`.
 *   - "Cancel"     — calls `onCancel()` so the parent can return to
 *     the repo-selection gate (T9).
 */
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'

// Hoisted mocks — must be declared before the SUT import.
const {
  mockRunBdCommand,
  mockDetectBd,
  mockInvalidateQueries,
  mockToastError,
  mockToastSuccess,
} = vi.hoisted(() => ({
  mockRunBdCommand: vi.fn(),
  mockDetectBd: vi.fn(),
  mockInvalidateQueries: vi.fn(),
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
}))

vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    runBdCommand: mockRunBdCommand,
    detectBd: mockDetectBd,
  },
}))

vi.mock('@tanstack/react-query', async () => {
  const actual = await vi.importActual('@tanstack/react-query')
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: mockInvalidateQueries,
    }),
  }
})

vi.mock('sonner', () => ({
  toast: {
    error: mockToastError,
    success: mockToastSuccess,
    info: vi.fn(),
    warning: vi.fn(),
  },
}))

// Logger noise reduction
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

const importSut = () => import('./BdInitFlow')

const defaultProps = {
  repoPath: '/Users/test/repo',
  onInitialized: vi.fn(),
  onCancel: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRunBdCommand.mockResolvedValue({
    status: 'ok',
    data: { type: 'text', value: '' },
  })
  mockDetectBd.mockResolvedValue({
    status: 'ok',
    data: {
      version: [1, 0, 5],
      schema_version: null,
      jsonl_path: null,
      backend: 'unknown',
    },
  })
  mockInvalidateQueries.mockResolvedValue(undefined)
})

describe('BdInitFlow', () => {
  it('renders the title and both action buttons', async () => {
    const { BdInitFlow } = await importSut()
    render(<BdInitFlow {...defaultProps} />)

    // Title (from i18n key beads.bootstrap.noBeadsWorkspace)
    expect(
      screen.getByRole('heading', { name: /no beads workspace found/i })
    ).toBeInTheDocument()

    // Initialize button (beads.bootstrap.initButton)
    expect(
      screen.getByRole('button', { name: /initialize/i })
    ).toBeInTheDocument()

    // Cancel button (beads.common.cancel)
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('initialize click invokes runBdCommand with ["init"] and repoPath', async () => {
    mockRunBdCommand.mockResolvedValue({
      status: 'ok',
      data: { type: 'text', value: 'initialized' },
    })
    // After init, detectBd now reports a jsonl path
    mockDetectBd.mockResolvedValue({
      status: 'ok',
      data: {
        version: [1, 0, 5],
        schema_version: 1,
        jsonl_path: '/Users/test/repo/.beads/issues.jsonl',
        backend: 'jsonl',
      },
    })

    const { BdInitFlow } = await importSut()
    const user = userEvent.setup()
    render(<BdInitFlow {...defaultProps} />)

    const initBtn = screen.getByRole('button', { name: /initialize/i })
    await user.click(initBtn)

    await waitFor(() => {
      expect(mockRunBdCommand).toHaveBeenCalledTimes(1)
    })

    const firstCall = (mockRunBdCommand as Mock).mock.calls[0]
    expect(firstCall).toBeDefined()
    const [args, cwd] = firstCall as [string[], string]
    expect(args).toEqual(['init'])
    expect(cwd).toBe('/Users/test/repo')
  })

  it('on init success, invalidates beads queries, refetches detectBd, and calls onInitialized', async () => {
    mockRunBdCommand.mockResolvedValue({
      status: 'ok',
      data: { type: 'text', value: 'initialized' },
    })
    mockDetectBd.mockResolvedValue({
      status: 'ok',
      data: {
        version: [1, 0, 5],
        schema_version: 1,
        jsonl_path: '/Users/test/repo/.beads/issues.jsonl',
        backend: 'jsonl',
      },
    })

    const onInitialized = vi.fn()
    const { BdInitFlow } = await importSut()
    const user = userEvent.setup()
    render(<BdInitFlow {...defaultProps} onInitialized={onInitialized} />)

    await user.click(screen.getByRole('button', { name: /initialize/i }))

    await waitFor(() => {
      expect(mockInvalidateQueries).toHaveBeenCalledWith({
        queryKey: ['beads'],
      })
    })

    // detectBd was re-invoked after success
    expect(mockDetectBd).toHaveBeenCalledWith('/Users/test/repo')

    // And the parent was notified
    expect(onInitialized).toHaveBeenCalledTimes(1)
  })

  it('on init success, shows error toast if post-init detectBd still has no jsonl', async () => {
    mockRunBdCommand.mockResolvedValue({
      status: 'ok',
      data: { type: 'text', value: 'initialized' },
    })
    // detectBd still reports no jsonl (init didn't take)
    mockDetectBd.mockResolvedValue({
      status: 'ok',
      data: {
        version: [1, 0, 5],
        schema_version: null,
        jsonl_path: null,
        backend: 'unknown',
      },
    })

    const onInitialized = vi.fn()
    const { BdInitFlow } = await importSut()
    const user = userEvent.setup()
    render(<BdInitFlow {...defaultProps} onInitialized={onInitialized} />)

    await user.click(screen.getByRole('button', { name: /initialize/i }))

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledTimes(1)
    })
    // Parent NOT notified
    expect(onInitialized).not.toHaveBeenCalled()
  })

  it('on init error, shows toast with stderr and does not call onInitialized', async () => {
    mockRunBdCommand.mockResolvedValue({
      status: 'error',
      error: {
        type: 'NonZeroExit',
        code: 1,
        stdout: '',
        stderr: 'not a git repository',
      },
    })

    const onInitialized = vi.fn()
    const { BdInitFlow } = await importSut()
    const user = userEvent.setup()
    render(<BdInitFlow {...defaultProps} onInitialized={onInitialized} />)

    await user.click(screen.getByRole('button', { name: /initialize/i }))

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledTimes(1)
    })

    const msg = (mockToastError as Mock).mock.calls[0]?.[0] as string
    expect(msg).toContain('not a git repository')

    // Parent NOT notified, no follow-up detectBd
    expect(onInitialized).not.toHaveBeenCalled()
    expect(mockDetectBd).not.toHaveBeenCalled()
    expect(mockInvalidateQueries).not.toHaveBeenCalled()
  })

  it('cancel button calls onCancel and does not invoke any command', async () => {
    const onCancel = vi.fn()
    const { BdInitFlow } = await importSut()
    const user = userEvent.setup()
    render(<BdInitFlow {...defaultProps} onCancel={onCancel} />)

    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(mockRunBdCommand).not.toHaveBeenCalled()
    expect(mockDetectBd).not.toHaveBeenCalled()
  })
})
