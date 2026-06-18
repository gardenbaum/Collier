/**
 * Tests for the SchemaCheck bootstrap modal.
 *
 * Contract: when `commands.detectBd(cwd)` returns a BdInfo with
 * `schema_version !== 1` (and not null), the blocking modal renders.
 * When `schema_version === 1` (or null), `onPass()` is called silently
 * and no modal appears.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { render } from '@/test/test-utils'

// React 19 + Vitest: silence "act() not configured" warnings.
;(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

// Hoisted mocks
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

const importSut = () => import('./SchemaCheck')

beforeEach(() => {
  vi.clearAllMocks()
  mockClose.mockResolvedValue(undefined)
})

describe('SchemaCheck modal', () => {
  it('schema 2 blocks with correct link href', async () => {
    mockDetectBd.mockResolvedValue({
      status: 'ok',
      data: {
        version: [1, 0, 5],
        schema_version: 2,
        backend: 'jsonl',
        jsonl_path: '.beads/x.jsonl',
      },
    })

    const { SchemaCheck } = await importSut()
    render(<SchemaCheck cwd="/test/repo" onPass={vi.fn()} />)

    await waitFor(() => {
      expect(mockDetectBd).toHaveBeenCalledTimes(1)
    })

    // Modal is visible
    expect(screen.getByTestId('schema-check-title')).toBeInTheDocument()

    // Link has correct href
    const link = screen.getByTestId('collier-releases-link')
    expect(link).toHaveAttribute(
      'href',
      'https://github.com/gardenbaum/Collier/releases'
    )
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')

    // Quit button present
    expect(screen.getByRole('button', { name: /quit/i })).toBeInTheDocument()
  })

  it('schema 1 skips and calls onPass', async () => {
    const onPass = vi.fn()
    mockDetectBd.mockResolvedValue({
      status: 'ok',
      data: {
        version: [1, 0, 5],
        schema_version: 1,
        backend: 'jsonl',
        jsonl_path: '.beads/x.jsonl',
      },
    })

    const { SchemaCheck } = await importSut()
    render(<SchemaCheck cwd="/test/repo" onPass={onPass} />)

    await waitFor(() => {
      expect(mockDetectBd).toHaveBeenCalledTimes(1)
    })

    // Modal not in document
    expect(
      screen.queryByText(/Beads schema version \d+ detected/i)
    ).not.toBeInTheDocument()

    // onPass was called
    expect(onPass).toHaveBeenCalledTimes(1)
  })

  it('null schema_version calls onPass silently', async () => {
    const onPass = vi.fn()
    mockDetectBd.mockResolvedValue({
      status: 'ok',
      data: {
        version: [1, 0, 5],
        schema_version: null,
        backend: 'unknown',
        jsonl_path: null,
      },
    })

    const { SchemaCheck } = await importSut()
    render(<SchemaCheck cwd="/test/repo" onPass={onPass} />)

    await waitFor(() => {
      expect(mockDetectBd).toHaveBeenCalledTimes(1)
    })

    expect(
      screen.queryByText(/Beads schema version \d+ detected/i)
    ).not.toBeInTheDocument()
    expect(onPass).toHaveBeenCalledTimes(1)
  })

  it('quit button closes the current window', async () => {
    mockDetectBd.mockResolvedValue({
      status: 'ok',
      data: {
        version: [1, 0, 5],
        schema_version: 3,
        backend: 'jsonl',
        jsonl_path: '.beads/x.jsonl',
      },
    })

    const { SchemaCheck } = await importSut()
    const user = userEvent.setup()
    render(<SchemaCheck cwd="/test/repo" onPass={vi.fn()} />)

    const quit = await screen.findByRole('button', { name: /quit/i })
    await user.click(quit)

    await waitFor(() => {
      expect(mockClose).toHaveBeenCalledTimes(1)
    })
  })

  it('treats detectBd error as pass-through', async () => {
    const onPass = vi.fn()
    mockDetectBd.mockResolvedValue({
      status: 'error',
      error: { type: 'NotFound', id: 'test' },
    })

    const { SchemaCheck } = await importSut()
    render(<SchemaCheck cwd="/test/repo" onPass={onPass} />)

    await waitFor(() => {
      expect(mockDetectBd).toHaveBeenCalledTimes(1)
    })

    expect(
      screen.queryByText(/Beads schema version \d+ detected/i)
    ).not.toBeInTheDocument()
    expect(onPass).toHaveBeenCalledTimes(1)
  })
})
