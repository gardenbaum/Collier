/**
 * Tests for the StatusOverviewView (T42).
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

const importSut = () => import('./StatusOverviewView')

const jsonOutput = (data: unknown) => ({
  status: 'ok' as const,
  data: { type: 'json', value: data },
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('StatusOverviewView', () => {
  it('renders loading states for all three sections initially', async () => {
    mockRunBdCommand.mockReturnValue(new Promise<never>(() => undefined))

    const { StatusOverviewView } = await importSut()
    render(<StatusOverviewView cwd="/repo" />)

    expect(screen.getByTestId('status-overview-view')).toBeInTheDocument()
    expect(screen.getByTestId('status-total-loading')).toBeInTheDocument()
    expect(screen.getByTestId('status-priority-loading')).toBeInTheDocument()
    expect(screen.getByTestId('status-type-loading')).toBeInTheDocument()
  })

  it('calls runBdCommand for status, count by-priority, and count by-type', async () => {
    mockRunBdCommand.mockResolvedValue(jsonOutput({}))

    const { StatusOverviewView } = await importSut()
    render(<StatusOverviewView cwd="/repo/path" />)

    await waitFor(() => {
      expect(mockRunBdCommand).toHaveBeenCalledWith(
        ['status', '--json'],
        '/repo/path'
      )
    })
    await waitFor(() => {
      expect(mockRunBdCommand).toHaveBeenCalledWith(
        ['count', '--by-priority', '--json'],
        '/repo/path'
      )
    })
    await waitFor(() => {
      expect(mockRunBdCommand).toHaveBeenCalledWith(
        ['count', '--by-type', '--json'],
        '/repo/path'
      )
    })
  })

  it('renders each section JSON dump in its respective <pre> block', async () => {
    mockRunBdCommand.mockImplementation(async (args: string[]) => {
      if (args[0] === 'status') {
        return jsonOutput({ summary: { open_issues: 5 } })
      }
      if (args[1] === '--by-priority') {
        return jsonOutput({ groups: [{ priority: 'P0', count: 1 }] })
      }
      if (args[1] === '--by-type') {
        return jsonOutput({ groups: [{ type: 'bug', count: 2 }] })
      }
      return jsonOutput({})
    })

    const { StatusOverviewView } = await importSut()
    render(<StatusOverviewView cwd="/repo" />)

    await waitFor(() => {
      expect(screen.getByTestId('status-total-pre')).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.getByTestId('status-priority-pre')).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.getByTestId('status-type-pre')).toBeInTheDocument()
    })

    expect(screen.getByTestId('status-total-pre').textContent).toContain(
      '"open_issues": 5'
    )
    expect(screen.getByTestId('status-priority-pre').textContent).toContain(
      '"P0"'
    )
    expect(screen.getByTestId('status-type-pre').textContent).toContain('"bug"')
  })

  it('renders the error state for the totals section without blocking the others', async () => {
    mockRunBdCommand.mockImplementation(async (args: string[]) => {
      if (args[0] === 'status') {
        return {
          status: 'error' as const,
          error: { type: 'ParseError', message: 'no status' },
        }
      }
      if (args[1] === '--by-priority') {
        return jsonOutput({ groups: [] })
      }
      if (args[1] === '--by-type') {
        return jsonOutput({ groups: [] })
      }
      return jsonOutput({})
    })

    const { StatusOverviewView } = await importSut()
    render(<StatusOverviewView cwd="/repo" />)

    await waitFor(() => {
      expect(screen.getByTestId('status-total-error')).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.getByTestId('status-priority-pre')).toBeInTheDocument()
    })
    expect(screen.getByTestId('status-total-error').textContent).toContain(
      'no status'
    )
  })

  it('preserves the AC-14 mono palette (no brand colour hex)', async () => {
    mockRunBdCommand.mockImplementation(async (args: string[]) => {
      if (args[0] === 'status') return jsonOutput({})
      if (args[1] === '--by-priority') return jsonOutput({})
      if (args[1] === '--by-type') return jsonOutput({})
      return jsonOutput({})
    })

    const { StatusOverviewView } = await importSut()
    const { container } = render(<StatusOverviewView cwd="/repo" />)

    await waitFor(() => {
      expect(screen.getByTestId('status-total-pre')).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.getByTestId('status-priority-pre')).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.getByTestId('status-type-pre')).toBeInTheDocument()
    })

    const html = container.innerHTML.toLowerCase()
    expect(html).not.toContain('c2410c')
  })
})
