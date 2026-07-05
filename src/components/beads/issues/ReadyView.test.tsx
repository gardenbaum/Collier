/**
 * Tests for the ReadyView wrapper.
 *
 * Contract: ReadyView is a thin wrapper around `StatusListView` that
 * supplies the per-status props for the ready IPC (`commands.bdReady`).
 * The shared skeleton / error / empty / row rendering surface is
 * covered by `StatusListView.test.tsx`; this suite only asserts the
 * wrapper-specific props (the bdReady command keypath, the heading,
 * the empty-state copy, and the `ready-*` testid prefix).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { render } from '@/test/test-utils'

const { mockBdReady } = vi.hoisted(() => ({
  mockBdReady: vi.fn(),
}))

vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    bdReady: mockBdReady,
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

const importSut = () => import('./ReadyView')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ReadyView (wrapper)', () => {
  it('calls bdReady with the provided cwd', async () => {
    mockBdReady.mockResolvedValue({ status: 'ok', data: [] })

    const { ReadyView } = await importSut()
    render(<ReadyView cwd="/repo/path" />)

    await waitFor(() => {
      expect(mockBdReady).toHaveBeenCalledWith('/repo/path')
    })
  })

  it('renders the ready heading and empty copy', async () => {
    mockBdReady.mockResolvedValue({ status: 'ok', data: [] })

    const { ReadyView } = await importSut()
    render(<ReadyView cwd="/fake" />)

    // Wait for the empty state to render — the heading is always
    // present (even during loading), so we have to wait for the
    // empty-state branch to confirm the query resolved.
    await waitFor(() => {
      expect(screen.getByTestId('ready-empty')).toBeInTheDocument()
    })
    expect(
      screen.getByRole('heading', { name: /Ready \(0\)/ })
    ).toBeInTheDocument()
    expect(screen.getByText('No ready work')).toBeInTheDocument()
  })

  it('uses the ready testid prefix on the shared surface', async () => {
    mockBdReady.mockReturnValue(new Promise<never>(() => undefined))

    const { ReadyView } = await importSut()
    render(<ReadyView cwd="/fake" />)

    expect(screen.getByTestId('ready-view')).toBeInTheDocument()
    expect(screen.getByTestId('ready-loading')).toBeInTheDocument()
    expect(screen.queryByTestId('blocked-view')).not.toBeInTheDocument()
    expect(screen.queryByTestId('blocked-loading')).not.toBeInTheDocument()
  })
})
