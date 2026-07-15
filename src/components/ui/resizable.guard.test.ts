import { afterEach, describe, expect, it, vi } from 'vitest'

describe('Resizable wrapper dependency guard', () => {
  afterEach(() => {
    vi.doUnmock('react-resizable-panels')
    vi.resetModules()
  })

  it('fails fast when the panels dependency is missing its required exports', async () => {
    vi.doMock('react-resizable-panels', () => ({
      PanelGroup: undefined,
      Panel: undefined,
      PanelResizeHandle: undefined,
    }))

    await expect(import('./resizable')).rejects.toThrow(
      'react-resizable-panels is missing required exports: PanelGroup, Panel, PanelResizeHandle.'
    )
  })
})
