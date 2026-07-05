/**
 * Tests for the BlockedView wrapper.
 *
 * Contract: BlockedView is a thin wrapper around `StatusListView`
 * that supplies the per-status props for the blocked IPC
 * (`commands.bdBlocked`). The shared skeleton / error / empty / row
 * rendering surface is covered by `StatusListView.test.tsx`; this
 * suite only asserts the wrapper-specific props (the bdBlocked
 * command keypath, the heading, the empty-state copy, and the
 * `blocked-*` testid prefix).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { render } from '@/test/test-utils'

const { mockBdBlocked } = vi.hoisted(() => ({
  mockBdBlocked: vi.fn(),
}))

vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    bdBlocked: mockBdBlocked,
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

const importSut = () => import('./BlockedView')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('BlockedView (wrapper)', () => {
  it('calls bdBlocked with the provided cwd', async () => {
    mockBdBlocked.mockResolvedValue({ status: 'ok', data: [] })

    const { BlockedView } = await importSut()
    render(<BlockedView cwd="/repo/path" />)

    await waitFor(() => {
      expect(mockBdBlocked).toHaveBeenCalledWith('/repo/path')
    })
  })

  it('renders the blocked heading and empty copy', async () => {
    mockBdBlocked.mockResolvedValue({ status: 'ok', data: [] })

    const { BlockedView } = await importSut()
    render(<BlockedView cwd="/fake" />)

    // Wait for the empty state to render — the heading is always
    // present (even during loading), so we have to wait for the
    // empty-state branch to confirm the query resolved.
    await waitFor(() => {
      expect(screen.getByTestId('blocked-empty')).toBeInTheDocument()
    })
    expect(
      screen.getByRole('heading', { name: /Blocked \(0\)/ })
    ).toBeInTheDocument()
    expect(screen.getByText('Nothing blocked')).toBeInTheDocument()
  })

  it('uses the blocked testid prefix on the shared surface', async () => {
    mockBdBlocked.mockReturnValue(new Promise<never>(() => undefined))

    const { BlockedView } = await importSut()
    render(<BlockedView cwd="/fake" />)

    expect(screen.getByTestId('blocked-view')).toBeInTheDocument()
    expect(screen.getByTestId('blocked-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('ready-view')).not.toBeInTheDocument()
    expect(screen.queryByTestId('ready-loading')).not.toBeInTheDocument()
  })
})
