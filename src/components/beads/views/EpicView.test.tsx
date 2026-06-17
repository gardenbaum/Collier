/**
 * Tests for the EpicView (T38).
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

const importSut = () => import('./EpicView')

const jsonOutput = (data: unknown) => ({
  status: 'ok' as const,
  data: { type: 'json', value: data },
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('EpicView', () => {
  it('renders a loading message while the query is pending', async () => {
    mockRunBdCommand.mockReturnValue(new Promise<never>(() => undefined))

    const { EpicView } = await importSut()
    render(<EpicView cwd="/repo" />)

    expect(screen.getByTestId('epic-view')).toBeInTheDocument()
    expect(screen.getByTestId('epic-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('epic-pre')).not.toBeInTheDocument()
  })

  it('calls runBdCommand with epic status --json and the cwd', async () => {
    mockRunBdCommand.mockResolvedValue(jsonOutput([]))

    const { EpicView } = await importSut()
    render(<EpicView cwd="/repo/path" />)

    await waitFor(() => {
      expect(mockRunBdCommand).toHaveBeenCalledWith(
        ['epic', 'status', '--json'],
        '/repo/path'
      )
    })
  })

  it('renders the unwrapped JSON in a <pre> on success', async () => {
    mockRunBdCommand.mockResolvedValue(
      jsonOutput([{ id: 'epic-1', title: 'Epic One', open: 3, closed: 7 }])
    )

    const { EpicView } = await importSut()
    render(<EpicView cwd="/repo" />)

    await waitFor(() => {
      expect(screen.getByTestId('epic-pre')).toBeInTheDocument()
    })

    const pre = screen.getByTestId('epic-pre')
    expect(pre.textContent).toContain('"id": "epic-1"')
    expect(pre.textContent).toContain('"title": "Epic One"')
  })

  it('renders the error state when runBdCommand returns an error', async () => {
    mockRunBdCommand.mockResolvedValue({
      status: 'error',
      error: { type: 'ParseError', message: 'bad envelope' },
    })

    const { EpicView } = await importSut()
    render(<EpicView cwd="/repo" />)

    await waitFor(() => {
      expect(screen.getByTestId('epic-error')).toBeInTheDocument()
    })
    expect(screen.getByTestId('epic-error').textContent).toContain(
      'bad envelope'
    )
    expect(screen.queryByTestId('epic-pre')).not.toBeInTheDocument()
  })

  it('preserves the AC-14 mono palette (no brand colour hex)', async () => {
    mockRunBdCommand.mockResolvedValue(jsonOutput([{ id: 'epic-1' }]))

    const { EpicView } = await importSut()
    const { container } = render(<EpicView cwd="/repo" />)

    await waitFor(() => {
      expect(screen.getByTestId('epic-pre')).toBeInTheDocument()
    })

    const html = container.innerHTML.toLowerCase()
    expect(html).not.toContain('c2410c')
  })
})
