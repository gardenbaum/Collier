/**
 * Tests for the SwarmView (T39).
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

const importSut = () => import('./SwarmView')

const jsonOutput = (data: unknown) => ({
  status: 'ok' as const,
  data: { type: 'json', value: data },
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SwarmView', () => {
  it('renders a loading message while the query is pending', async () => {
    mockRunBdCommand.mockReturnValue(new Promise<never>(() => undefined))

    const { SwarmView } = await importSut()
    render(<SwarmView cwd="/repo" />)

    expect(screen.getByTestId('swarm-view')).toBeInTheDocument()
    expect(screen.getByTestId('swarm-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('swarm-pre')).not.toBeInTheDocument()
  })

  it('calls runBdCommand with swarm list --json and the cwd', async () => {
    mockRunBdCommand.mockResolvedValue(jsonOutput([]))

    const { SwarmView } = await importSut()
    render(<SwarmView cwd="/repo/path" />)

    await waitFor(() => {
      expect(mockRunBdCommand).toHaveBeenCalledWith(
        ['swarm', 'list', '--json'],
        '/repo/path'
      )
    })
  })

  it('renders the unwrapped JSON in a <pre> on success', async () => {
    mockRunBdCommand.mockResolvedValue(
      jsonOutput([{ id: 'swarm-1', epic: 'epic-1', status: 'active' }])
    )

    const { SwarmView } = await importSut()
    render(<SwarmView cwd="/repo" />)

    await waitFor(() => {
      expect(screen.getByTestId('swarm-pre')).toBeInTheDocument()
    })

    const pre = screen.getByTestId('swarm-pre')
    expect(pre.textContent).toContain('"id": "swarm-1"')
    expect(pre.textContent).toContain('"epic": "epic-1"')
  })

  it('renders the error state when runBdCommand returns an error', async () => {
    mockRunBdCommand.mockResolvedValue({
      status: 'error',
      error: {
        type: 'NonZeroExit',
        code: 1,
        stdout: '',
        stderr: 'no swarm',
      },
    })

    const { SwarmView } = await importSut()
    render(<SwarmView cwd="/repo" />)

    await waitFor(() => {
      expect(screen.getByTestId('swarm-error')).toBeInTheDocument()
    })
    expect(screen.getByTestId('swarm-error').textContent).toContain('no swarm')
    expect(screen.queryByTestId('swarm-pre')).not.toBeInTheDocument()
  })

  it('preserves the AC-14 mono palette (no brand colour hex)', async () => {
    mockRunBdCommand.mockResolvedValue(jsonOutput([{ id: 'swarm-1' }]))

    const { SwarmView } = await importSut()
    const { container } = render(<SwarmView cwd="/repo" />)

    await waitFor(() => {
      expect(screen.getByTestId('swarm-pre')).toBeInTheDocument()
    })

    const html = container.innerHTML.toLowerCase()
    expect(html).not.toContain('c2410c')
  })
})
