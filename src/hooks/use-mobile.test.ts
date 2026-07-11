/**
 * Tests for the `useIsMobile` hook, which tracks whether the viewport
 * width is below the `MOBILE_BREAKPOINT` (768px) and updates via the
 * `(max-width: 767px)` media-query listener.
 */
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useIsMobile } from './use-mobile'

// Each call to `window.matchMedia` (mocked in src/test/setup.ts) returns a
// fresh object with fresh `addEventListener` / `removeEventListener` spies.
// Capture the most recent `matchMedia` result so individual tests can assert
// against the listener wired up for the hook.
const getLatestMediaQueryList = () => {
  const matchMedia = window.matchMedia as unknown as Mock
  const calls = matchMedia.mock.results
  if (calls.length === 0) {
    throw new Error('window.matchMedia was not called by the hook')
  }
  return calls[calls.length - 1]?.value as {
    addEventListener: Mock
    removeEventListener: Mock
  }
}

const captureChangeListener = () => {
  const mql = getLatestMediaQueryList()
  const addCall = mql.addEventListener.mock.calls.find(
    call => call[0] === 'change'
  )
  if (!addCall) {
    throw new Error('hook did not register a "change" listener')
  }
  return addCall[1] as () => void
}

describe('useIsMobile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('initial render', () => {
    it('returns true when window.innerWidth is below the breakpoint', () => {
      window.innerWidth = 600

      const { result } = renderHook(() => useIsMobile())

      expect(result.current).toBe(true)
    })

    it('returns false when window.innerWidth is at or above the breakpoint', () => {
      window.innerWidth = 1024

      const { result } = renderHook(() => useIsMobile())

      expect(result.current).toBe(false)
    })
  })

  describe('media-query listener wiring', () => {
    it('queries `(max-width: 767px)` and registers a change listener', () => {
      window.innerWidth = 1024

      renderHook(() => useIsMobile())

      expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 767px)')
      const mql = getLatestMediaQueryList()
      expect(mql.addEventListener).toHaveBeenCalledTimes(1)
      expect(mql.addEventListener.mock.calls[0]?.[0]).toBe('change')
      expect(mql.addEventListener.mock.calls[0]?.[1]).toBeTypeOf('function')
    })

    it('updates state when the change listener fires after a resize', () => {
      window.innerWidth = 600
      const { result, rerender } = renderHook(() => useIsMobile())
      expect(result.current).toBe(true)

      // Simulate a viewport resize across the breakpoint.
      window.innerWidth = 1024
      const onChange = captureChangeListener()
      act(() => {
        onChange()
      })

      rerender()
      expect(result.current).toBe(false)
    })
  })

  describe('cleanup', () => {
    it('removes the change listener on unmount', () => {
      window.innerWidth = 1024
      const { unmount } = renderHook(() => useIsMobile())
      const onChange = captureChangeListener()

      unmount()

      const mql = getLatestMediaQueryList()
      expect(mql.removeEventListener).toHaveBeenCalledTimes(1)
      expect(mql.removeEventListener).toHaveBeenCalledWith('change', onChange)
    })
  })
})
