import { render, screen, waitFor } from '@/test/test-utils'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { commands } from '@/lib/tauri-bindings'

// Tauri bindings are mocked globally in src/test/setup.ts
// The bootstrap flow needs extra mocks for detectBd / loadPreferences / getCurrentDir / addRecentRepo

const openMock = vi.fn()
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: (...args: unknown[]) => openMock(...args),
}))

vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    detectBd: vi.fn(),
    addRecentRepo: vi.fn(),
    loadPreferences: vi.fn(),
    savePreferences: vi.fn(),
    getCurrentDir: vi.fn(),
  },
  unwrapResult: (result: { status: string; data?: unknown }) => {
    if (result.status === 'ok') return result.data
    throw result
  },
}))

const mockedGetCurrentDir = vi.mocked(commands.getCurrentDir)
const mockedDetectBd = vi.mocked(commands.detectBd)
const mockedLoadPreferences = vi.mocked(commands.loadPreferences)
const mockedAddRecentRepo = vi.mocked(commands.addRecentRepo)

beforeEach(() => {
  vi.clearAllMocks()
  mockedGetCurrentDir.mockResolvedValue({ status: 'ok', data: '/test/cwd' })
  mockedDetectBd.mockResolvedValue({
    status: 'ok',
    data: {
      version: [1, 0, 5],
      schema_version: 1,
      jsonl_path: null,
      backend: 'jsonl',
    },
  })
  mockedLoadPreferences.mockResolvedValue({
    status: 'ok',
    data: {
      theme: 'system',
      quick_pane_shortcut: null,
      language: null,
      recent_repos: [],
    },
  })
  mockedAddRecentRepo.mockResolvedValue({ status: 'ok', data: null })
})

import App from './App'

describe('App', () => {
  it('renders the bootstrap gate when no repo is selected', async () => {
    render(<App />)
    // The repo-picker button is the first thing the bootstrap flow shows
    expect(await screen.findByTestId('repo-picker-button')).toBeInTheDocument()
  })

  it('wires the repo picker through the bootstrap flow', async () => {
    render(<App />)
    await screen.findByTestId('repo-picker-button')

    // Sanity: the file picker button can be clicked without errors
    const user = (await import('@testing-library/user-event')).userEvent.setup()
    await user.click(screen.getByTestId('repo-picker-button'))
    await waitFor(() => {
      expect(openMock).toHaveBeenCalled()
    })
  })
})
