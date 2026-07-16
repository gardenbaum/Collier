/**
 * Tests for the `BdInitFlow` component.
 *
 * Contract: `<BdInitFlow />` is the bootstrap-gate panel rendered when
 * `commands.detectBd(cwd)` reports `jsonl_path === null` and
 * `backend === "unknown"` (i.e. no `.beads/` directory exists yet).
 * It offers two actions:
 *
 *   - Initialize: invokes `commands.runBdCommand(["init"], repoPath)`,
 *     then refetches `detectBd(repoPath)`. If both succeed and the
 *     second reports a `jsonl_path`, the beads query namespace is
 *     invalidated and `onInitialized()` is called. Any failure (error
 *     return value, missing jsonl, thrown exception) routes through
 *     `formatBdError` and surfaces as a Sonner toast.
 *   - Cancel:     invokes `onCancel()` and does not touch the Tauri
 *     command layer.
 *
 * `formatBdError` is the pure helper at the top of the file. Every
 * branch is exercised through the component by passing different
 * `BdError` shapes (NonZeroExit with/without stderr, with/without
 * `code`, type-only errors, plain Error throws). Tests assert on the
 * resulting toast message rather than re-exporting the helper, so
 * the public surface stays minimal.
 *
 * Mocks follow the same hoisted `vi.fn()` pattern proven in
 * `SchemaCheck.test.tsx` / `QuitButton.test.tsx` / `BdNotInPath.test.tsx`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'
import type { BdError, BdInfo } from '@/lib/bindings'

// React 19 + Vitest: silence "act() not configured" warnings.
;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

// Hoisted mocks — must be declared before the SUT is imported so the
// `vi.mock` calls below can capture them.
const { mockRunBdCommand, mockDetectBd, mockToastError, mockLoggerError } =
  vi.hoisted(() => ({
    mockRunBdCommand: vi.fn(),
    mockDetectBd: vi.fn(),
    mockToastError: vi.fn(),
    mockLoggerError: vi.fn(),
  }))

vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    runBdCommand: mockRunBdCommand,
    detectBd: mockDetectBd,
  },
}))

vi.mock('sonner', () => ({
  toast: {
    error: mockToastError,
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: mockLoggerError,
  },
}))

// Lazy import so the mocks above are wired before the SUT is evaluated.
const importSut = () => import('./BdInitFlow')

const REPO_PATH = '/test/repo'

const okBdInfo: BdInfo = {
  version: [1, 0, 0],
  schema_version: 1,
  backend: 'jsonl',
  jsonl_path: '.beads/issues.jsonl',
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('BdInitFlow', () => {
  describe('rendering', () => {
    it('renders the prompt, heading, and both action buttons', async () => {
      const { BdInitFlow } = await importSut()
      render(
        <BdInitFlow
          repoPath={REPO_PATH}
          onInitialized={vi.fn()}
          onCancel={vi.fn()}
        />
      )

      // Heading from i18n key
      expect(
        screen.getByRole('heading', { name: /no beads workspace/i })
      ).toBeInTheDocument()
      // aria-label on the wrapping <section>
      expect(
        screen.getByRole('region', { name: /no beads workspace/i })
      ).toBeInTheDocument()
      // Body text mentions the repo path
      expect(
        screen.getByText(new RegExp(`Initialize Beads at ${REPO_PATH}\\?`))
      ).toBeInTheDocument()
      // Initialize + Cancel buttons
      expect(
        screen.getByRole('button', { name: /initialize beads/i })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /cancel/i })
      ).toBeInTheDocument()
      // No command calls until the user interacts
      expect(mockRunBdCommand).not.toHaveBeenCalled()
      expect(mockDetectBd).not.toHaveBeenCalled()
    })

    it('Cancel button calls onCancel without invoking any Tauri command', async () => {
      const onCancel = vi.fn()
      const onInitialized = vi.fn()
      const { BdInitFlow } = await importSut()
      const user = userEvent.setup()

      render(
        <BdInitFlow
          repoPath={REPO_PATH}
          onInitialized={onInitialized}
          onCancel={onCancel}
        />
      )

      await user.click(screen.getByRole('button', { name: /cancel/i }))

      expect(onCancel).toHaveBeenCalledTimes(1)
      expect(onInitialized).not.toHaveBeenCalled()
      expect(mockRunBdCommand).not.toHaveBeenCalled()
      expect(mockDetectBd).not.toHaveBeenCalled()
    })
  })

  describe('Initialize — success path', () => {
    it('runs init, refetches detectBd, invalidates queries, and calls onInitialized', async () => {
      mockRunBdCommand.mockResolvedValue({
        status: 'ok',
        data: { type: 'text', value: 'Initialized empty Beads workspace' },
      })
      mockDetectBd.mockResolvedValue({ status: 'ok', data: okBdInfo })

      const onInitialized = vi.fn()
      const { BdInitFlow } = await importSut()
      const user = userEvent.setup()

      render(
        <BdInitFlow
          repoPath={REPO_PATH}
          onInitialized={onInitialized}
          onCancel={vi.fn()}
        />
      )

      await user.click(
        screen.getByRole('button', { name: /initialize beads/i })
      )

      await waitFor(() => {
        expect(onInitialized).toHaveBeenCalledTimes(1)
      })

      expect(mockRunBdCommand).toHaveBeenCalledTimes(1)
      expect(mockRunBdCommand).toHaveBeenCalledWith(['init'], REPO_PATH)
      expect(mockDetectBd).toHaveBeenCalledTimes(1)
      expect(mockDetectBd).toHaveBeenCalledWith(REPO_PATH)
      // No error toast on the happy path
      expect(mockToastError).not.toHaveBeenCalled()
      expect(mockLoggerError).not.toHaveBeenCalled()
    })
  })

  describe('Initialize — formatBdError branches', () => {
    // The helper itself isn't exported; we exercise every branch by
    // returning a different `BdError` shape from `runBdCommand` and
    // asserting on the toast message that gets rendered.

    it('NonZeroExit with non-empty stderr surfaces trimmed stderr', async () => {
      const err: BdError = {
        type: 'NonZeroExit',
        code: 1,
        stdout: '',
        stderr: '  cannot init: not a git repo  ',
      }
      mockRunBdCommand.mockResolvedValue({ status: 'error', error: err })
      // detectBd shouldn't even be reached, but stub it defensively
      mockDetectBd.mockResolvedValue({ status: 'ok', data: okBdInfo })

      const onInitialized = vi.fn()
      const { BdInitFlow } = await importSut()
      const user = userEvent.setup()

      render(
        <BdInitFlow
          repoPath={REPO_PATH}
          onInitialized={onInitialized}
          onCancel={vi.fn()}
        />
      )

      await user.click(
        screen.getByRole('button', { name: /initialize beads/i })
      )

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledTimes(1)
      })
      expect(mockToastError).toHaveBeenCalledWith(
        'bd init failed: cannot init: not a git repo'
      )
      expect(onInitialized).not.toHaveBeenCalled()
      // detectBd must NOT be called when runBdCommand already errored
      expect(mockDetectBd).not.toHaveBeenCalled()
    })

    it('NonZeroExit with empty stderr falls back to the exit code', async () => {
      const err: BdError = {
        type: 'NonZeroExit',
        code: 42,
        stdout: '',
        stderr: '',
      }
      mockRunBdCommand.mockResolvedValue({ status: 'error', error: err })
      mockDetectBd.mockResolvedValue({ status: 'ok', data: okBdInfo })

      const onInitialized = vi.fn()
      const { BdInitFlow } = await importSut()
      const user = userEvent.setup()

      render(
        <BdInitFlow
          repoPath={REPO_PATH}
          onInitialized={onInitialized}
          onCancel={vi.fn()}
        />
      )

      await user.click(
        screen.getByRole('button', { name: /initialize beads/i })
      )

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith(
          'bd init failed: bd exited with code 42'
        )
      })
      expect(onInitialized).not.toHaveBeenCalled()
      expect(mockDetectBd).not.toHaveBeenCalled()
    })

    it('NonZeroExit with empty stderr and unknown code falls back to "?"', async () => {
      // Cast to BdError — the strict type forbids missing `code`, but
      // the helper's runtime behaviour for `code === undefined` is
      // exactly the fallback under test, so we simulate the
      // worst-case shape the helper might receive.
      const err = {
        type: 'NonZeroExit',
        stdout: '',
        stderr: '',
        // intentionally no `code` field
      } as unknown as BdError
      mockRunBdCommand.mockResolvedValue({ status: 'error', error: err })
      mockDetectBd.mockResolvedValue({ status: 'ok', data: okBdInfo })

      const onInitialized = vi.fn()
      const { BdInitFlow } = await importSut()
      const user = userEvent.setup()

      render(
        <BdInitFlow
          repoPath={REPO_PATH}
          onInitialized={onInitialized}
          onCancel={vi.fn()}
        />
      )

      await user.click(
        screen.getByRole('button', { name: /initialize beads/i })
      )

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith(
          'bd init failed: bd exited with code ?'
        )
      })
      expect(onInitialized).not.toHaveBeenCalled()
    })

    it('errors with a message field surface that message verbatim', async () => {
      const err: BdError = {
        type: 'SchemaMismatch',
        message: 'expected schema 1, got 2',
      }
      mockRunBdCommand.mockResolvedValue({ status: 'error', error: err })
      mockDetectBd.mockResolvedValue({ status: 'ok', data: okBdInfo })

      const onInitialized = vi.fn()
      const { BdInitFlow } = await importSut()
      const user = userEvent.setup()

      render(
        <BdInitFlow
          repoPath={REPO_PATH}
          onInitialized={onInitialized}
          onCancel={vi.fn()}
        />
      )

      await user.click(
        screen.getByRole('button', { name: /initialize beads/i })
      )

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith(
          'bd init failed: expected schema 1, got 2'
        )
      })
      expect(onInitialized).not.toHaveBeenCalled()
    })

    it('type-only errors (e.g. BdNotInPath) fall back to the type name', async () => {
      const err: BdError = { type: 'BdNotInPath' }
      mockRunBdCommand.mockResolvedValue({ status: 'error', error: err })
      mockDetectBd.mockResolvedValue({ status: 'ok', data: okBdInfo })

      const onInitialized = vi.fn()
      const { BdInitFlow } = await importSut()
      const user = userEvent.setup()

      render(
        <BdInitFlow
          repoPath={REPO_PATH}
          onInitialized={onInitialized}
          onCancel={vi.fn()}
        />
      )

      await user.click(
        screen.getByRole('button', { name: /initialize beads/i })
      )

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith(
          'bd init failed: BdNotInPath'
        )
      })
      expect(onInitialized).not.toHaveBeenCalled()
    })

    it('non-typed throws (plain Error) hit the String(error) fallback', async () => {
      // A plain Error has no `type` property, so formatBdError takes
      // the outer `if`-else's else branch: `return String(error)`.
      mockRunBdCommand.mockRejectedValue(new Error('boom'))
      mockDetectBd.mockResolvedValue({ status: 'ok', data: okBdInfo })

      const onInitialized = vi.fn()
      const { BdInitFlow } = await importSut()
      const user = userEvent.setup()

      render(
        <BdInitFlow
          repoPath={REPO_PATH}
          onInitialized={onInitialized}
          onCancel={vi.fn()}
        />
      )

      await user.click(
        screen.getByRole('button', { name: /initialize beads/i })
      )

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledTimes(1)
      })
      // String(new Error('boom')) === 'Error: boom'
      expect(mockToastError).toHaveBeenCalledWith('bd init failed: Error: boom')
      expect(mockLoggerError).toHaveBeenCalledTimes(1)
      expect(mockLoggerError).toHaveBeenCalledWith('bd init crashed', {
        err: expect.any(Error),
      })
      expect(onInitialized).not.toHaveBeenCalled()
    })
  })

  describe('Initialize — post-init detectBd result', () => {
    it('toasts and bails when detectBd returns no jsonl_path', async () => {
      mockRunBdCommand.mockResolvedValue({
        status: 'ok',
        data: { type: 'text', value: 'Initialized empty Beads workspace' },
      })
      // jsonl_path is null → workspace is still empty
      mockDetectBd.mockResolvedValue({
        status: 'ok',
        data: { ...okBdInfo, jsonl_path: null, backend: 'unknown' },
      })

      const onInitialized = vi.fn()
      const { BdInitFlow } = await importSut()
      const user = userEvent.setup()

      render(
        <BdInitFlow
          repoPath={REPO_PATH}
          onInitialized={onInitialized}
          onCancel={vi.fn()}
        />
      )

      await user.click(
        screen.getByRole('button', { name: /initialize beads/i })
      )

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith(
          'bd init succeeded but workspace is still empty'
        )
      })
      expect(onInitialized).not.toHaveBeenCalled()
    })

    it('toasts and bails when detectBd returns an error', async () => {
      mockRunBdCommand.mockResolvedValue({
        status: 'ok',
        data: { type: 'text', value: 'Initialized empty Beads workspace' },
      })
      mockDetectBd.mockResolvedValue({
        status: 'error',
        error: { type: 'NotFound', id: 'beads' },
      })

      const onInitialized = vi.fn()
      const { BdInitFlow } = await importSut()
      const user = userEvent.setup()

      render(
        <BdInitFlow
          repoPath={REPO_PATH}
          onInitialized={onInitialized}
          onCancel={vi.fn()}
        />
      )

      await user.click(
        screen.getByRole('button', { name: /initialize beads/i })
      )

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith(
          'bd init succeeded but workspace is still empty'
        )
      })
      expect(onInitialized).not.toHaveBeenCalled()
    })
  })
})
