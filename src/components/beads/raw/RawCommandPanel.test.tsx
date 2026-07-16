/**
 * Tests for the RawCommandPanel (T43).
 *
 * Contract: typing into the input and submitting the form (Enter or
 * click) calls `commands.runBdCommand` with the input split on
 * whitespace. Output is rendered via `OutputRenderer`. The submit
 * button is disabled while the mutation is pending and when the input
 * is empty.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
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

const importSut = () => import('./RawCommandPanel')

const jsonOutput = (data: unknown) => ({
  status: 'ok' as const,
  data: { type: 'json', value: data },
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RawCommandPanel', () => {
  it('renders input and submit button', async () => {
    const { RawCommandPanel } = await importSut()
    render(<RawCommandPanel cwd="/repo" />)

    expect(screen.getByTestId('raw-command-panel')).toBeInTheDocument()
    expect(screen.getByTestId('raw-command-input')).toBeInTheDocument()
    expect(screen.getByTestId('raw-command-submit')).toBeInTheDocument()
  })

  it('disables the submit button when the input is empty', async () => {
    const { RawCommandPanel } = await importSut()
    render(<RawCommandPanel cwd="/repo" />)

    const submit = screen.getByTestId('raw-command-submit') as HTMLButtonElement
    expect(submit.disabled).toBe(true)
  })

  it('splits the input on whitespace and calls runBdCommand on submit', async () => {
    mockRunBdCommand.mockResolvedValue(jsonOutput([{ id: 'beads-1' }]))

    const { RawCommandPanel } = await importSut()
    render(<RawCommandPanel cwd="/repo/path" />)

    fireEvent.change(screen.getByTestId('raw-command-input'), {
      target: { value: 'list --priority 0' },
    })
    fireEvent.click(screen.getByTestId('raw-command-submit'))

    await waitFor(() => {
      expect(mockRunBdCommand).toHaveBeenCalledWith(
        ['list', '--priority', '0'],
        '/repo/path'
      )
    })
  })

  it('renders the command output via OutputRenderer', async () => {
    mockRunBdCommand.mockResolvedValue(
      jsonOutput([{ id: 'beads-1', title: 'Ship T43' }])
    )

    const { RawCommandPanel } = await importSut()
    render(<RawCommandPanel cwd="/repo" />)

    fireEvent.change(screen.getByTestId('raw-command-input'), {
      target: { value: 'list' },
    })
    fireEvent.click(screen.getByTestId('raw-command-submit'))

    await waitFor(() => {
      expect(screen.getByTestId('output-table')).toBeInTheDocument()
    })
    expect(screen.getByTestId('output-table').textContent).toContain('beads-1')
  })

  it('renders the error state when the command fails', async () => {
    mockRunBdCommand.mockResolvedValue({
      status: 'error',
      error: {
        type: 'NonZeroExit',
        code: 1,
        stdout: '',
        stderr: 'unknown subcmd',
      },
    })

    const { RawCommandPanel } = await importSut()
    render(<RawCommandPanel cwd="/repo" />)

    fireEvent.change(screen.getByTestId('raw-command-input'), {
      target: { value: 'nope' },
    })
    fireEvent.click(screen.getByTestId('raw-command-submit'))

    await waitFor(() => {
      expect(screen.getByTestId('output-error')).toBeInTheDocument()
    })
    expect(screen.getByTestId('output-error').textContent).toContain(
      'unknown subcmd'
    )
  })

  it('renders stdout when a NonZeroExit error has no stderr', async () => {
    mockRunBdCommand.mockResolvedValue({
      status: 'error',
      error: {
        type: 'NonZeroExit',
        code: 1,
        stdout: 'command output',
        stderr: '',
      },
    })

    const { RawCommandPanel } = await importSut()
    render(<RawCommandPanel cwd="/repo" />)

    fireEvent.change(screen.getByTestId('raw-command-input'), {
      target: { value: 'nope' },
    })
    fireEvent.click(screen.getByTestId('raw-command-submit'))

    await waitFor(() => {
      expect(screen.getByTestId('output-error').textContent).toContain(
        'bd failed: command output'
      )
    })
  })

  it('renders the error type when no specific error message is available', async () => {
    mockRunBdCommand.mockResolvedValue({
      status: 'error',
      error: { type: 'OtherError' },
    })

    const { RawCommandPanel } = await importSut()
    render(<RawCommandPanel cwd="/repo" />)

    fireEvent.change(screen.getByTestId('raw-command-input'), {
      target: { value: 'nope' },
    })
    fireEvent.click(screen.getByTestId('raw-command-submit'))

    await waitFor(() => {
      expect(screen.getByTestId('output-error').textContent).toContain(
        'OtherError'
      )
    })
  })

  it('renders a specific message when a typed error provides one', async () => {
    mockRunBdCommand.mockResolvedValue({
      status: 'error',
      error: { type: 'OtherError', message: 'detailed failure' },
    })

    const { RawCommandPanel } = await importSut()
    render(<RawCommandPanel cwd="/repo" />)

    fireEvent.change(screen.getByTestId('raw-command-input'), {
      target: { value: 'nope' },
    })
    fireEvent.click(screen.getByTestId('raw-command-submit'))

    await waitFor(() => {
      expect(screen.getByTestId('output-error').textContent).toContain(
        'detailed failure'
      )
    })
  })

  it('renders an Error message when the error has no type field', async () => {
    mockRunBdCommand.mockResolvedValue({
      status: 'error',
      error: new Error('command exploded'),
    })

    const { RawCommandPanel } = await importSut()
    render(<RawCommandPanel cwd="/repo" />)

    fireEvent.change(screen.getByTestId('raw-command-input'), {
      target: { value: 'nope' },
    })
    fireEvent.click(screen.getByTestId('raw-command-submit'))

    await waitFor(() => {
      expect(screen.getByTestId('output-error').textContent).toContain(
        'command exploded'
      )
    })
  })

  it('stringifies non-object errors', async () => {
    mockRunBdCommand.mockResolvedValue({
      status: 'error',
      error: 'raw command failure',
    })

    const { RawCommandPanel } = await importSut()
    render(<RawCommandPanel cwd="/repo" />)

    fireEvent.change(screen.getByTestId('raw-command-input'), {
      target: { value: 'nope' },
    })
    fireEvent.click(screen.getByTestId('raw-command-submit'))

    await waitFor(() => {
      expect(screen.getByTestId('output-error').textContent).toContain(
        'raw command failure'
      )
    })
  })

  it('ignores whitespace-only input when the form is submitted directly', async () => {
    const { RawCommandPanel } = await importSut()
    render(<RawCommandPanel cwd="/repo" />)

    fireEvent.change(screen.getByTestId('raw-command-input'), {
      target: { value: '   ' },
    })
    fireEvent.submit(screen.getByRole('form', { name: 'Run bd command' }))

    expect(mockRunBdCommand).not.toHaveBeenCalled()
    expect(screen.getByTestId('raw-command-history')).toHaveTextContent(
      'History: 0'
    )
  })

  it('preserves the AC-14 mono palette (no brand colour hex)', async () => {
    mockRunBdCommand.mockResolvedValue(jsonOutput({ ok: true }))

    const { RawCommandPanel } = await importSut()
    const { container } = render(<RawCommandPanel cwd="/repo" />)

    fireEvent.change(screen.getByTestId('raw-command-input'), {
      target: { value: 'list' },
    })
    fireEvent.click(screen.getByTestId('raw-command-submit'))

    await waitFor(() => {
      expect(screen.getByTestId('output-object')).toBeInTheDocument()
    })

    const html = container.innerHTML.toLowerCase()
    expect(html).not.toContain('c2410c')
  })
})
