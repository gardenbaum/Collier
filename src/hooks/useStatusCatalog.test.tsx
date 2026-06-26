/**
 * Tests for useStatusCatalog — M6 R-Custom-Status hook.
 *
 * Contract:
 *   - Queries `commands.bdStatuses(cwd)` keyed by
 *     `['beads', 'statuses', cwd]`.
 *   - Returns the merged catalog (`builtin + custom + statusNames`)
 *     once the query resolves.
 *   - Falls back to the v1 built-in status names (`open`,
 *     `in_progress`, `blocked`, `deferred`, `closed`) while the
 *     query is pending so consumers can render chips without
 *     special-casing "no data yet".
 *   - The hook is disabled when `cwd === null` (no query fires
 *     before a workspace is selected).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useStatusCatalog } from './useStatusCatalog'
import type { StatusCatalog } from '@/lib/bindings'

const { mockBdStatuses } = vi.hoisted(() => ({
  mockBdStatuses: vi.fn(),
}))

vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    bdStatuses: mockBdStatuses,
  },
}))

/** Fixture catalog with one custom status (`review:wip`) — the
 * shape the M6 contract requires (built-in first, custom appended
 * alphabetically by `name`). */
const fixtureCatalog: StatusCatalog = {
  builtin: [
    {
      name: 'open',
      category: 'active',
      icon: '○',
      description: null,
      isBuiltin: true,
    },
    {
      name: 'in_progress',
      category: 'wip',
      icon: '◐',
      description: null,
      isBuiltin: true,
    },
    {
      name: 'blocked',
      category: 'wip',
      icon: '●',
      description: null,
      isBuiltin: true,
    },
    {
      name: 'deferred',
      category: 'frozen',
      icon: '❄',
      description: null,
      isBuiltin: true,
    },
    {
      name: 'closed',
      category: 'done',
      icon: '✓',
      description: null,
      isBuiltin: true,
    },
  ],
  custom: [
    {
      name: 'review',
      category: 'wip',
      icon: null,
      description: null,
      isBuiltin: false,
    },
  ],
  statusNames: [
    'open',
    'in_progress',
    'blocked',
    'deferred',
    'closed',
    'review',
  ],
}

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
  return Wrapper
}

describe('useStatusCatalog', () => {
  beforeEach(() => {
    mockBdStatuses.mockReset()
  })

  it('returns the catalog with custom statuses once the query resolves', async () => {
    mockBdStatuses.mockResolvedValue({ status: 'ok', data: fixtureCatalog })

    const { result } = renderHook(() => useStatusCatalog('/fake'), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => {
      expect(result.current.catalog).toEqual(fixtureCatalog)
    })
    // The flat list merges built-ins + custom alphabetically.
    expect(result.current.statusNames).toContain('review')
    expect(result.current.statusNames).toContain('closed')
    expect(result.current.builtin.length).toBe(5)
    expect(result.current.custom.length).toBe(1)
    expect(result.current.isLoading).toBe(false)
  })

  it('falls back to the v1 built-in names while the query is pending', async () => {
    // Hang the resolution — the hook should return the
    // fallback set, not `undefined`, so consumers can render
    // the chip list immediately.
    let resolveFn: (value: unknown) => void = () => undefined
    mockBdStatuses.mockImplementation(
      () =>
        new Promise(resolve => {
          resolveFn = resolve
        })
    )

    const { result } = renderHook(() => useStatusCatalog('/fake'), {
      wrapper: makeWrapper(),
    })

    // The fallback matches the v1 lifecycle order so the
    // sidebar reads the same way during the brief loading window.
    expect(result.current.statusNames).toEqual([
      'open',
      'in_progress',
      'blocked',
      'deferred',
      'closed',
    ])
    expect(result.current.builtin.length).toBe(5)
    expect(result.current.catalog).toBeUndefined()
    expect(result.current.isLoading).toBe(true)

    // Now resolve and confirm the hook flips to the live data.
    resolveFn({ status: 'ok', data: fixtureCatalog })
    await waitFor(() => {
      expect(result.current.catalog).toEqual(fixtureCatalog)
    })
  })

  it('does not fire the query when cwd is null', () => {
    mockBdStatuses.mockResolvedValue({ status: 'ok', data: fixtureCatalog })

    const { result } = renderHook(() => useStatusCatalog(null), {
      wrapper: makeWrapper(),
    })

    // Fallback set while no workspace is selected — the sidebar
    // would render the v1 chips if it somehow tried to mount
    // before the bootstrap flow picked a repo.
    expect(result.current.statusNames).toEqual([
      'open',
      'in_progress',
      'blocked',
      'deferred',
      'closed',
    ])
    expect(mockBdStatuses).not.toHaveBeenCalled()
  })

  it('surfaces the typed error when the IPC call fails', async () => {
    mockBdStatuses.mockResolvedValue({
      status: 'error',
      error: {
        type: 'NonZeroExit',
        code: 1,
        stdout: '',
        stderr: 'fatal: not a beads repository',
      },
    })

    const { result } = renderHook(() => useStatusCatalog('/fake'), {
      wrapper: makeWrapper(),
    })

    await waitFor(() => {
      expect(result.current.error).not.toBeNull()
    })
    // The fallback set is still present so the UI is never
    // blank during an error state — the existing StatusOverview
    // contract holds even when the catalog query fails.
    expect(result.current.statusNames).toEqual([
      'open',
      'in_progress',
      'blocked',
      'deferred',
      'closed',
    ])
    expect(result.current.catalog).toBeUndefined()
  })
})
