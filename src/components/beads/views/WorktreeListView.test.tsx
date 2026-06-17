/**
 * Tests for the WorktreeListView (T40).
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

const importSut = () => import('./WorktreeListView')

const jsonOutput = (data: unknown) => ({
  status: 'ok' as const,
  data: { type: 'json', value: data },
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('WorktreeListView', () => {
  it('renders a loading message while the query is pending', async () => {
    mockRunBdCommand.mockReturnValue(new Promise<never>(() => undefined))

    const { WorktreeListView } = await importSut()
    render(<WorktreeListView cwd="/repo" />)

    expect(screen.getByTestId('worktree-list-view')).toBeInTheDocument()
    expect(screen.getByTestId('worktree-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('worktree-pre')).not.toBeInTheDocument()
  })

  it('calls runBdCommand with branch --json and the cwd', async () => {
    // ponytail: bd 1.0.5 has no `bd worktree`; `bd branch` is the
    // closest read-only list and is what the component calls.
    mockRunBdCommand.mockResolvedValue(
      jsonOutput({ branches: ['main'], current: 'main' })
    )

    const { WorktreeListView } = await importSut()
    render(<WorktreeListView cwd="/repo/path" />)

    await waitFor(() => {
      expect(mockRunBdCommand).toHaveBeenCalledWith(
        ['branch', '--json'],
        '/repo/path'
      )
    })
  })

  it('does not have any create / remove / switch buttons (OUT guardrail)', async () => {
    mockRunBdCommand.mockResolvedValue(jsonOutput({ branches: ['main'] }))

    const { WorktreeListView } = await importSut()
    const { container } = render(<WorktreeListView cwd="/repo" />)

    await waitFor(() => {
      expect(screen.getByTestId('worktree-pre')).toBeInTheDocument()
    })

    // No buttons at all — the plan's OUT list forbids create / remove / switch.
    expect(container.querySelectorAll('button').length).toBe(0)
  })

  it('renders the unwrapped JSON in a <pre> on success', async () => {
    mockRunBdCommand.mockResolvedValue(
      jsonOutput({ branches: ['main', 'feature'], current: 'main' })
    )

    const { WorktreeListView } = await importSut()
    render(<WorktreeListView cwd="/repo" />)

    await waitFor(() => {
      expect(screen.getByTestId('worktree-pre')).toBeInTheDocument()
    })

    const pre = screen.getByTestId('worktree-pre')
    expect(pre.textContent).toContain('"branches"')
    expect(pre.textContent).toContain('"feature"')
  })

  it('renders the error state when runBdCommand returns an error', async () => {
    mockRunBdCommand.mockResolvedValue({
      status: 'error',
      error: { type: 'ParseError', message: 'no worktree support' },
    })

    const { WorktreeListView } = await importSut()
    render(<WorktreeListView cwd="/repo" />)

    await waitFor(() => {
      expect(screen.getByTestId('worktree-error')).toBeInTheDocument()
    })
    expect(screen.getByTestId('worktree-error').textContent).toContain(
      'no worktree support'
    )
    expect(screen.queryByTestId('worktree-pre')).not.toBeInTheDocument()
  })

  it('preserves the AC-14 mono palette (no brand colour hex)', async () => {
    mockRunBdCommand.mockResolvedValue(jsonOutput({ branches: [] }))

    const { WorktreeListView } = await importSut()
    const { container } = render(<WorktreeListView cwd="/repo" />)

    await waitFor(() => {
      expect(screen.getByTestId('worktree-pre')).toBeInTheDocument()
    })

    const html = container.innerHTML.toLowerCase()
    expect(html).not.toContain('c2410c')
  })
})
