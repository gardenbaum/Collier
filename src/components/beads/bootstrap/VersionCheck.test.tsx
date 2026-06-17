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
const { mockDetectBd, mockClose } = vi.hoisted(() => ({
  mockDetectBd: vi.fn(),
  mockClose: vi.fn(),
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

// Logger noise reduction
vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
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
})
