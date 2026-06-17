/**
 * Tests for the SyncStatusView (T41).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { render } from '@/test/test-utils'

const { mockRunBdCommand } = vi.hoisted(() => ({
  mockRunBdCommand: vi.fn(),
}))

vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    runBdCommand: mockRunBdCommand,
  },
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

const importSut = () => import('./SyncStatusView')

const jsonOutput = (data: unknown) => ({
  status: 'ok' as const,
  data: { type: 'json', value: data },
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SyncStatusView', () => {
  it('renders a loading state for both sections initially', async () => {
    mockRunBdCommand.mockReturnValue(new Promise<never>(() => undefined))

    const { SyncStatusView } = await importSut()
    render(<SyncStatusView cwd="/repo" />)

    expect(screen.getByTestId('sync-status-view')).toBeInTheDocument()
    expect(screen.getByTestId('sync-vc-loading')).toBeInTheDocument()
    expect(screen.getByTestId('sync-dolt-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('sync-vc-pre')).not.toBeInTheDocument()
    expect(screen.queryByTestId('sync-dolt-pre')).not.toBeInTheDocument()
  })

  it('calls runBdCommand for vc status and dolt status with the cwd', async () => {
    mockRunBdCommand.mockResolvedValue(
      jsonOutput({ branch: 'main', commit: 'abc' })
    )

    const { SyncStatusView } = await importSut()
    render(<SyncStatusView cwd="/repo/path" />)

    await waitFor(() => {
      expect(mockRunBdCommand).toHaveBeenCalledWith(
        ['vc', 'status', '--json'],
        '/repo/path'
      )
    })
    await waitFor(() => {
      expect(mockRunBdCommand).toHaveBeenCalledWith(
        ['dolt', 'status', '--json'],
        '/repo/path'
      )
    })
  })

  it('renders the vc + dolt JSON dumps in their respective <pre> blocks', async () => {
    mockRunBdCommand.mockImplementation(async (args: string[]) => {
      if (args[0] === 'vc') return jsonOutput({ branch: 'main', commit: 'abc' })
      if (args[0] === 'dolt') return jsonOutput({ mode: 'embedded' })
      return jsonOutput({})
    })

    const { SyncStatusView } = await importSut()
    render(<SyncStatusView cwd="/repo" />)

    await waitFor(() => {
      expect(screen.getByTestId('sync-vc-pre')).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.getByTestId('sync-dolt-pre')).toBeInTheDocument()
    })

    expect(screen.getByTestId('sync-vc-pre').textContent).toContain(
      '"branch": "main"'
    )
    expect(screen.getByTestId('sync-dolt-pre').textContent).toContain(
      '"mode": "embedded"'
    )
  })

  it('renders the error state for vc without blocking the dolt section', async () => {
    mockRunBdCommand.mockImplementation(async (args: string[]) => {
      if (args[0] === 'vc') {
        return {
          status: 'error' as const,
          error: { type: 'ParseError', message: 'no vc' },
        }
      }
      if (args[0] === 'dolt') return jsonOutput({ mode: 'embedded' })
      return jsonOutput({})
    })

    const { SyncStatusView } = await importSut()
    render(<SyncStatusView cwd="/repo" />)

    await waitFor(() => {
      expect(screen.getByTestId('sync-vc-error')).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.getByTestId('sync-dolt-pre')).toBeInTheDocument()
    })
    expect(screen.getByTestId('sync-vc-error').textContent).toContain('no vc')
  })

  it('preserves the AC-14 mono palette (no brand colour hex)', async () => {
    mockRunBdCommand.mockImplementation(async (args: string[]) => {
      if (args[0] === 'vc') return jsonOutput({ branch: 'main' })
      if (args[0] === 'dolt') return jsonOutput({ mode: 'embedded' })
      return jsonOutput({})
    })

    const { SyncStatusView } = await importSut()
    const { container } = render(<SyncStatusView cwd="/repo" />)

    await waitFor(() => {
      expect(screen.getByTestId('sync-vc-pre')).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.getByTestId('sync-dolt-pre')).toBeInTheDocument()
    })

    const html = container.innerHTML.toLowerCase()
    expect(html).not.toContain('c2410c')
  })
})
