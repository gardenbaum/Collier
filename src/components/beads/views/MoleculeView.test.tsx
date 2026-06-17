/**
 * Tests for the MoleculeView (T37).
 *
 * Contract: MoleculeView calls `commands.runBdCommand(['mol', 'show', id, '--json'], cwd)`
 * via TanStack Query, shows a loading message while pending, shows an
 * error state on failure, and renders the unwrapped JSON in a
 * monospace `<pre>` on success.
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

const importSut = () => import('./MoleculeView')

const jsonOutput = (data: unknown) => ({
  status: 'ok' as const,
  data: { type: 'json', value: data },
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('MoleculeView', () => {
  it('renders a loading message while the query is pending', async () => {
    mockRunBdCommand.mockReturnValue(new Promise<never>(() => undefined))

    const { MoleculeView } = await importSut()
    render(<MoleculeView cwd="/repo" moleculeId="beads-1" />)

    expect(screen.getByTestId('molecule-view')).toBeInTheDocument()
    expect(screen.getByTestId('molecule-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('molecule-pre')).not.toBeInTheDocument()
    expect(screen.queryByTestId('molecule-error')).not.toBeInTheDocument()
  })

  it('calls runBdCommand with mol show <id> --json and the cwd', async () => {
    mockRunBdCommand.mockResolvedValue(jsonOutput({ id: 'beads-1' }))

    const { MoleculeView } = await importSut()
    render(<MoleculeView cwd="/repo/path" moleculeId="beads-1" />)

    await waitFor(() => {
      expect(mockRunBdCommand).toHaveBeenCalledWith(
        ['mol', 'show', 'beads-1', '--json'],
        '/repo/path'
      )
    })
  })

  it('renders the unwrapped JSON in a <pre> on success', async () => {
    mockRunBdCommand.mockResolvedValue(
      jsonOutput({ id: 'beads-1', title: 'Molecule One' })
    )

    const { MoleculeView } = await importSut()
    render(<MoleculeView cwd="/repo" moleculeId="beads-1" />)

    await waitFor(() => {
      expect(screen.getByTestId('molecule-pre')).toBeInTheDocument()
    })

    const pre = screen.getByTestId('molecule-pre')
    expect(pre.textContent).toContain('"id": "beads-1"')
    expect(pre.textContent).toContain('"title": "Molecule One"')
    expect(pre.textContent).toContain('"beads-1"')
  })

  it('renders the error state when runBdCommand returns an error', async () => {
    mockRunBdCommand.mockResolvedValue({
      status: 'error',
      error: {
        type: 'NonZeroExit',
        code: 1,
        stdout: '',
        stderr: 'no such molecule',
      },
    })

    const { MoleculeView } = await importSut()
    render(<MoleculeView cwd="/repo" moleculeId="beads-1" />)

    await waitFor(() => {
      expect(screen.getByTestId('molecule-error')).toBeInTheDocument()
    })
    expect(screen.getByTestId('molecule-error').textContent).toContain(
      'no such molecule'
    )
    expect(screen.queryByTestId('molecule-pre')).not.toBeInTheDocument()
  })

  it('preserves the AC-14 mono palette (no brand colour hex)', async () => {
    mockRunBdCommand.mockResolvedValue(jsonOutput({ id: 'beads-1' }))

    const { MoleculeView } = await importSut()
    const { container } = render(
      <MoleculeView cwd="/repo" moleculeId="beads-1" />
    )

    await waitFor(() => {
      expect(screen.getByTestId('molecule-pre')).toBeInTheDocument()
    })

    const html = container.innerHTML.toLowerCase()
    expect(html).not.toContain('c2410c')
  })
})
