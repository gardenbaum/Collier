import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock matchMedia for tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// ponytail: jsdom does not lay out elements, so `offsetWidth`,
// `offsetHeight`, and `getBoundingClientRect` all return 0 by default.
// `@tanstack/react-virtual` measures the scroll container via
// `offsetWidth`/`offsetHeight` (see @tanstack/virtual-core's `getRect`),
// and other consumers in this codebase reach for `getBoundingClientRect`
// directly — both must report the inline size the test set.
//
// We honour any explicit inline `height`/`width` the test/component set
// on the element (so a `<div style="height: 200px">` reports 200) and
// fall back to a sensible default for everything else. Elements without
// an inline size keep the original jsdom zero-rect behaviour.
const originalGetBoundingClientRect =
  Element.prototype.getBoundingClientRect.bind(Element.prototype)
Element.prototype.getBoundingClientRect = function patchedGetBoundingClientRect(
  this: Element
) {
  if (this instanceof HTMLElement) {
    const inlineHeight = this.style.height
    const inlineWidth = this.style.width
    if (inlineHeight || inlineWidth) {
      const height = inlineHeight ? parseInt(inlineHeight, 10) || 600 : 600
      const width = inlineWidth ? parseInt(inlineWidth, 10) || 800 : 800
      return {
        width,
        height,
        top: 0,
        left: 0,
        right: width,
        bottom: height,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }
    }
  }
  // ponytail: Radix UI's dropdown-menu portals pass elements
  // through @floating-ui/dom, which calls `getBoundingClientRect`
  // on nodes that may not be HTMLElements (SVG, document fragments,
  // nodes from other documents, etc.). The original jsdom
  // implementation throws on those; Radix then emits an unhandled
  // rejection that vitest counts as a test error. Return a
  // zero-rect stub so the floating-ui math degrades to "place at
  // origin" rather than throwing — tests that assert on position
  // are out of scope here.
  if (this instanceof Element) {
    return {
      width: 0,
      height: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }
  }
  return originalGetBoundingClientRect()
}

const parseInlinePx = (value: string): number | null => {
  const match = /^(\d+(?:\.\d+)?)px$/.exec(value.trim())
  return match && match[1] ? Number(match[1]) : null
}

// `offsetWidth` / `offsetHeight` are getters; jsdom returns 0. We can't
// wrap a getter via prototype replacement (the descriptor is non-writable
// on the prototype), so we redefine the descriptors on each instance via
// a per-element style patch instead. The patching happens lazily in a
// MutationObserver-free way: every time a render touches a node we re-
// sync its `offset*` getters to match its inline style. In practice the
// virtualizer measures the scroll element on mount, so we hook into
// `useLayoutEffect` from the test wrapper — but here in setup.ts the
// simplest robust path is to install a getter that reads the inline
// style at call-time. That requires redefining on the prototype, which
// `Object.defineProperty` allows when we flip `configurable: true`.
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
  configurable: true,
  get(this: HTMLElement): number {
    return parseInlinePx(this.style.height) ?? 0
  },
})
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
  configurable: true,
  get(this: HTMLElement): number {
    return parseInlinePx(this.style.width) ?? 0
  },
})

// Mock Tauri APIs for tests
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {
    // Mock unlisten function
  }),
}))

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn().mockResolvedValue(null),
}))

// Mock typed Tauri bindings (tauri-specta generated). The bootstrap
// flow's test (`src/App.test.tsx`) overrides this with a fuller
// mock; this fallback only fires for tests that don't override
// the binding themselves.
vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    loadPreferences: vi
      .fn()
      .mockResolvedValue({ status: 'ok', data: { theme: 'system' } }),
    savePreferences: vi.fn().mockResolvedValue({ status: 'ok', data: null }),
    sendNativeNotification: vi
      .fn()
      .mockResolvedValue({ status: 'ok', data: null }),
    saveEmergencyData: vi.fn().mockResolvedValue({ status: 'ok', data: null }),
    loadEmergencyData: vi.fn().mockResolvedValue({ status: 'ok', data: null }),
    cleanupOldRecoveryFiles: vi
      .fn()
      .mockResolvedValue({ status: 'ok', data: 0 }),
    isDiagnosticLoggingEnabled: vi
      .fn()
      .mockResolvedValue({ status: 'ok', data: false }),
    setDiagnosticLogging: vi
      .fn()
      .mockResolvedValue({ status: 'ok', data: null }),
    writeLogLine: vi.fn().mockResolvedValue({ status: 'ok', data: null }),
  },
  unwrapResult: vi.fn((result: { status: string; data?: unknown }) => {
    if (result.status === 'ok') return result.data
    throw result
  }),
}))
