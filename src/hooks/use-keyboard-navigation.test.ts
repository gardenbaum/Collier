/**
 * Tests for the M5 keyboard navigation hook.
 *
 * The hook is mounted via `renderHook` and exercises a synthetic
 * keydown dispatcher so we can verify:
 *   1. `j` / `k` advance / retreat the keyboard cursor through the
 *      rendered rows in document order.
 *   2. `Enter` opens the issue under the cursor.
 *   3. `Escape` clears the cursor (the drawer is not mounted in the
 *      hook's test — Escape's "close drawer" branch is owned by
 *      IssueDetailDrawer, which has its own tests).
 *   4. `/` focuses the search input and switches to the search view.
 *   5. `h` / `l` collapse / expand the current epic on the epic view.
 *   6. The hook does NOT steal keystrokes when the user is typing in
 *      an input / textarea / contenteditable.
 *   7. The hook does NOT fire while the command palette or detail
 *      drawer is open.
 *   8. The hook detaches its listener on unmount.
 *
 * DOM fixtures are inserted into `document.body` with `data-testid`
 * + `data-issue-id` / `data-epic-id` so the hook's `collectRows`
 * walks them as if they were real rows. We tear them down in
 * `afterEach` so the next test sees a clean DOM.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useUIStore } from '@/store/ui-store'
import { useWorkspaceStore } from '@/store/workspace-store'
import {
  useKeyboardNavigation,
  focusSearchInput,
} from './use-keyboard-navigation'

function pressKey(
  key: string,
  options: {
    target?: EventTarget | null
    preventDefault?: () => void
  } = {}
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  })
  if (options.target) {
    Object.defineProperty(event, 'target', { value: options.target })
  }
  if (options.preventDefault) {
    const original = event.preventDefault.bind(event)
    event.preventDefault = () => {
      original()
      options.preventDefault?.()
    }
  }
  window.document.dispatchEvent(event)
  return event
}

function makeRow(
  id: string,
  testId: 'issue-row' | 'epic-row' | 'epic-child-row' = 'issue-row'
): HTMLElement {
  const el = document.createElement('div')
  el.setAttribute('data-testid', testId)
  // M5: every navigable row opts in via `data-kbd-nav="row"` +
  // `data-row-id="<issue-id>"`. This keeps the keyboard-nav
  // contract separate from each view's readable testid.
  el.setAttribute('data-kbd-nav', 'row')
  el.setAttribute('data-row-id', id)
  // Make the row programmatically focusable in jsdom. In the
  // real app `IssueListView` sets `tabIndex={isKeyboardSelected ?
  // 0 : -1}` on the row; here we just need jsdom to treat the
  // row as a focusable target so `row.element.focus()` actually
  // moves `document.activeElement`. The exact tabindex value
  // doesn't matter — jsdom honours focus on any tabindex-bearing
  // element regardless of its in-tab-order status.
  el.setAttribute('tabindex', '-1')
  if (testId === 'epic-row') {
    el.setAttribute('data-epic-id', id)
    el.setAttribute('data-expanded', 'true')
    const chevron = document.createElement('button')
    chevron.setAttribute('data-testid', 'epic-chevron')
    chevron.setAttribute('data-expanded', 'true')
    let expanded = true
    chevron.addEventListener('click', () => {
      expanded = !expanded
      chevron.setAttribute('data-expanded', expanded ? 'true' : 'false')
      el.setAttribute('data-expanded', expanded ? 'true' : 'false')
    })
    el.appendChild(chevron)
  } else {
    el.setAttribute('data-issue-id', id)
  }
  document.body.appendChild(el)
  return el
}

function clearDom(): void {
  document.body.innerHTML = ''
}

describe('useKeyboardNavigation', () => {
  beforeEach(() => {
    useUIStore.setState({
      commandPaletteOpen: false,
      sidebarVisible: true,
      leftSidebarVisible: true,
    })
    useWorkspaceStore.setState({
      repoPath: '/test',
      activeView: 'list',
      selectedIssueId: null,
      selectedRowId: null,
    })
    clearDom()
  })

  afterEach(() => {
    clearDom()
    vi.restoreAllMocks()
  })

  describe('j / k navigation', () => {
    it('j selects the next visible row', () => {
      makeRow('A')
      makeRow('B')
      makeRow('C')
      renderHook(() => useKeyboardNavigation())

      pressKey('j')

      expect(useWorkspaceStore.getState().selectedRowId).toBe('A')
    })

    it('two j presses move through the rendered list in document order', () => {
      makeRow('A')
      makeRow('B')
      makeRow('C')
      renderHook(() => useKeyboardNavigation())

      pressKey('j')
      pressKey('j')

      expect(useWorkspaceStore.getState().selectedRowId).toBe('B')
    })

    it('k moves backward through the rendered list', () => {
      makeRow('A')
      makeRow('B')
      makeRow('C')
      renderHook(() => useKeyboardNavigation())

      pressKey('j')
      pressKey('j')
      pressKey('k')

      expect(useWorkspaceStore.getState().selectedRowId).toBe('A')
    })

    it('j on the last row is a no-op (cursor does not move)', () => {
      makeRow('A')
      makeRow('B')
      renderHook(() => useKeyboardNavigation())

      pressKey('j')
      pressKey('j')
      pressKey('j')
      pressKey('j')

      expect(useWorkspaceStore.getState().selectedRowId).toBe('B')
    })

    it('k on the first row is a no-op', () => {
      makeRow('A')
      makeRow('B')
      renderHook(() => useKeyboardNavigation())

      pressKey('j')
      pressKey('k')
      pressKey('k')

      expect(useWorkspaceStore.getState().selectedRowId).toBe('A')
    })

    it('walks only mounted (virtualised) rows — k above the cursor never reads from the data array', () => {
      // Three rows mounted; a phantom 4th in document order would
      // show up if the hook walked the data array instead of the
      // DOM. Asserting against the actual rendered ids is sufficient
      // — the hook has no other observable behaviour for this case.
      makeRow('A')
      makeRow('B')
      makeRow('C')
      renderHook(() => useKeyboardNavigation())

      pressKey('j')
      pressKey('j')
      pressKey('j')

      expect(useWorkspaceStore.getState().selectedRowId).toBe('C')
    })

    it('walks epic rows by data-epic-id when no list rows are mounted', () => {
      makeRow('EPIC-1', 'epic-row')
      makeRow('EPIC-2', 'epic-row')
      renderHook(() => useKeyboardNavigation())

      pressKey('j')
      expect(useWorkspaceStore.getState().selectedRowId).toBe('EPIC-1')
      pressKey('j')
      expect(useWorkspaceStore.getState().selectedRowId).toBe('EPIC-2')
    })

    it('with no rendered rows, j does not change the cursor', () => {
      renderHook(() => useKeyboardNavigation())

      pressKey('j')

      expect(useWorkspaceStore.getState().selectedRowId).toBeNull()
    })

    it('j from no cursor moves keyboard focus to the first row (roving tabindex)', () => {
      // Without this, the cursor lands on row 1 (data-row-selected=true)
      // but document.activeElement stays on body — the user could see
      // the visual selection yet Enter wouldn't open the row. The
      // keyboard hook is responsible for syncing DOM focus with the
      // cursor because the row uses `tabIndex={0}` (roving tabindex),
      // not `aria-activedescendant`.
      const a = makeRow('A')
      const b = makeRow('B')
      renderHook(() => useKeyboardNavigation())

      pressKey('j')

      expect(useWorkspaceStore.getState().selectedRowId).toBe('A')
      expect(document.activeElement).toBe(a)
      expect(document.activeElement).not.toBe(b)
    })

    it('j from a stale cursor (no longer in the DOM) moves focus to the first row', () => {
      // When the workspace re-renders and the previous cursor's row
      // is unmounted, the next j/k from the keyboard hook should
      // still focus the new target — not just update selectedRowId.
      const a = makeRow('A')
      const b = makeRow('B')
      useWorkspaceStore.setState({ selectedRowId: 'STALE-NOT-IN-DOM' })
      renderHook(() => useKeyboardNavigation())

      pressKey('j')

      expect(useWorkspaceStore.getState().selectedRowId).toBe('A')
      expect(document.activeElement).toBe(a)
      expect(document.activeElement).not.toBe(b)
    })

    it('k from no cursor moves keyboard focus to the LAST row', () => {
      const a = makeRow('A')
      const c = makeRow('C')
      renderHook(() => useKeyboardNavigation())

      pressKey('k')

      expect(useWorkspaceStore.getState().selectedRowId).toBe('C')
      expect(document.activeElement).toBe(c)
      expect(document.activeElement).not.toBe(a)
    })

    it('anchors to the first row when the stored cursor is no longer in the DOM', () => {
      makeRow('A')
      makeRow('B')
      makeRow('C')
      // Pretend the cursor pointed at a row from a previous render.
      useWorkspaceStore.setState({ selectedRowId: 'STALE' })

      renderHook(() => useKeyboardNavigation())
      pressKey('j')

      expect(useWorkspaceStore.getState().selectedRowId).toBe('A')
    })
  })

  describe('Enter', () => {
    it('opens the selected row in the detail drawer', () => {
      makeRow('A')
      makeRow('B')
      renderHook(() => useKeyboardNavigation())

      pressKey('j')
      pressKey('Enter')

      expect(useWorkspaceStore.getState().selectedIssueId).toBe('A')
    })

    it('is a no-op when no row is selected', () => {
      makeRow('A')
      renderHook(() => useKeyboardNavigation())

      pressKey('Enter')

      expect(useWorkspaceStore.getState().selectedIssueId).toBeNull()
    })

    it('preventDefault is called so the input does not also receive Enter', () => {
      const preventDefault = vi.fn()
      makeRow('A')
      renderHook(() => useKeyboardNavigation())

      pressKey('j')
      pressKey('Enter', { preventDefault })

      expect(preventDefault).toHaveBeenCalledTimes(1)
    })
  })

  describe('Escape', () => {
    it('clears the cursor when no drawer is open', () => {
      makeRow('A')
      renderHook(() => useKeyboardNavigation())
      pressKey('j')
      expect(useWorkspaceStore.getState().selectedRowId).toBe('A')

      pressKey('Escape')

      expect(useWorkspaceStore.getState().selectedRowId).toBeNull()
    })

    it('does nothing when no cursor and no drawer is set', () => {
      renderHook(() => useKeyboardNavigation())

      pressKey('Escape')

      expect(useWorkspaceStore.getState().selectedRowId).toBeNull()
      // No exception, no preventDefault side effects — the event
      // bubbles to other Escape handlers (e.g. modal close).
    })

    it('does not steal Escape when the drawer is open (drawer owns it)', () => {
      useWorkspaceStore.setState({ selectedIssueId: 'OPEN-1' })
      renderHook(() => useKeyboardNavigation())

      pressKey('Escape')

      // The drawer remains open — the keyboard hook ignores Escape
      // entirely while the drawer is up. The drawer's own keydown
      // listener closes it (covered by IssueDetailDrawer tests).
      expect(useWorkspaceStore.getState().selectedIssueId).toBe('OPEN-1')
    })
  })

  describe('/', () => {
    it('switches to the search view and dispatches the focus event', () => {
      const onFocus = vi.fn()
      window.addEventListener('collier:focus-search-input', onFocus)
      renderHook(() => useKeyboardNavigation())

      pressKey('/')

      expect(useWorkspaceStore.getState().activeView).toBe('search')
      expect(onFocus).toHaveBeenCalledTimes(1)

      window.removeEventListener('collier:focus-search-input', onFocus)
    })

    it('focusSearchInput() (called from the command palette) dispatches the same event', () => {
      const onFocus = vi.fn()
      window.addEventListener('collier:focus-search-input', onFocus)

      focusSearchInput()

      expect(onFocus).toHaveBeenCalledTimes(1)
      window.removeEventListener('collier:focus-search-input', onFocus)
    })

    it('does not steal / when the user is typing in a search field', () => {
      const onFocus = vi.fn()
      window.addEventListener('collier:focus-search-input', onFocus)
      const input = document.createElement('input')
      input.type = 'search'
      document.body.appendChild(input)

      renderHook(() => useKeyboardNavigation())

      pressKey('/', { target: input })

      // Active view stays put; no focus event dispatched.
      expect(useWorkspaceStore.getState().activeView).toBe('list')
      expect(onFocus).not.toHaveBeenCalled()

      window.removeEventListener('collier:focus-search-input', onFocus)
    })
  })

  describe('h / l epic collapse / expand', () => {
    it('l expands a collapsed epic', () => {
      const epic = makeRow('EPIC-1', 'epic-row')
      epic.setAttribute('data-expanded', 'false')
      const chevron = epic.querySelector('[data-testid="epic-chevron"]')
      if (chevron) chevron.setAttribute('data-expanded', 'false')
      // Override the click handler installed by makeRow so the
      // toggle is observable from the test.
      let expanded = false
      if (chevron) {
        chevron.addEventListener('click', () => {
          expanded = true
          epic.setAttribute('data-expanded', 'true')
          chevron.setAttribute('data-expanded', 'true')
        })
      }

      useWorkspaceStore.setState({ selectedRowId: 'EPIC-1' })
      renderHook(() => useKeyboardNavigation())

      pressKey('l')

      expect(expanded).toBe(true)
      expect(epic.getAttribute('data-expanded')).toBe('true')
    })

    it('h collapses an expanded epic', () => {
      const epic = makeRow('EPIC-1', 'epic-row')
      const chevron = epic.querySelector('[data-testid="epic-chevron"]')
      let collapsed = false
      if (chevron) {
        chevron.addEventListener('click', () => {
          collapsed = true
          epic.setAttribute('data-expanded', 'false')
          chevron.setAttribute('data-expanded', 'false')
        })
      }

      useWorkspaceStore.setState({ selectedRowId: 'EPIC-1' })
      renderHook(() => useKeyboardNavigation())

      pressKey('h')

      expect(collapsed).toBe(true)
      expect(epic.getAttribute('data-expanded')).toBe('false')
    })

    it('l on an already-expanded epic is a no-op', () => {
      const epic = makeRow('EPIC-1', 'epic-row')
      const chevron = epic.querySelector('[data-testid="epic-chevron"]')
      let toggleCount = 0
      if (chevron) {
        chevron.addEventListener('click', () => {
          toggleCount++
        })
      }

      useWorkspaceStore.setState({ selectedRowId: 'EPIC-1' })
      renderHook(() => useKeyboardNavigation())

      pressKey('l')

      expect(toggleCount).toBe(0)
    })

    it('h / l without a selected row are no-ops', () => {
      makeRow('EPIC-1', 'epic-row')
      renderHook(() => useKeyboardNavigation())

      pressKey('h')
      pressKey('l')

      // No state change, no exception.
      expect(useWorkspaceStore.getState().selectedRowId).toBeNull()
    })
  })

  describe('modifier keys', () => {
    it('does not intercept Cmd/Ctrl/Alt-modified keys', () => {
      makeRow('A')
      renderHook(() => useKeyboardNavigation())

      const event = new KeyboardEvent('keydown', {
        key: 'j',
        metaKey: true,
        bubbles: true,
        cancelable: true,
      })
      window.document.dispatchEvent(event)

      expect(useWorkspaceStore.getState().selectedRowId).toBeNull()
    })
  })

  describe('typing guards', () => {
    it('does not intercept j/k/Enter inside an <input type="text">', () => {
      makeRow('A')
      const input = document.createElement('input')
      input.type = 'text'
      document.body.appendChild(input)
      renderHook(() => useKeyboardNavigation())

      pressKey('j', { target: input })
      pressKey('Enter', { target: input })

      expect(useWorkspaceStore.getState().selectedRowId).toBeNull()
      expect(useWorkspaceStore.getState().selectedIssueId).toBeNull()
    })

    it('does not intercept j/k inside a <textarea>', () => {
      makeRow('A')
      const textarea = document.createElement('textarea')
      document.body.appendChild(textarea)
      renderHook(() => useKeyboardNavigation())

      pressKey('j', { target: textarea })

      expect(useWorkspaceStore.getState().selectedRowId).toBeNull()
    })

    it('does not intercept h/l inside an <input>', () => {
      const epic = makeRow('EPIC-1', 'epic-row')
      const chevron = epic.querySelector('[data-testid="epic-chevron"]')
      let toggleCount = 0
      if (chevron) {
        chevron.addEventListener('click', () => {
          toggleCount++
        })
      }
      const input = document.createElement('input')
      input.type = 'text'
      document.body.appendChild(input)
      useWorkspaceStore.setState({ selectedRowId: 'EPIC-1' })
      renderHook(() => useKeyboardNavigation())

      pressKey('l', { target: input })

      expect(toggleCount).toBe(0)
    })

    it('still honours Escape inside an input (cursor clears)', () => {
      makeRow('A')
      const input = document.createElement('input')
      input.type = 'text'
      document.body.appendChild(input)
      useWorkspaceStore.setState({ selectedRowId: 'A' })
      renderHook(() => useKeyboardNavigation())

      pressKey('Escape', { target: input })

      expect(useWorkspaceStore.getState().selectedRowId).toBeNull()
    })
  })

  describe('overlay guards', () => {
    it('does not navigate while the command palette is open', () => {
      makeRow('A')
      makeRow('B')
      useUIStore.setState({ commandPaletteOpen: true })
      renderHook(() => useKeyboardNavigation())

      pressKey('j')

      expect(useWorkspaceStore.getState().selectedRowId).toBeNull()
    })

    it('does not navigate while the detail drawer is open', () => {
      makeRow('A')
      makeRow('B')
      useWorkspaceStore.setState({ selectedIssueId: 'OPEN-1' })
      renderHook(() => useKeyboardNavigation())

      pressKey('j')

      expect(useWorkspaceStore.getState().selectedRowId).toBeNull()
    })
  })

  describe('lifecycle', () => {
    it('detaches the document keydown listener on unmount', () => {
      makeRow('A')
      const { unmount } = renderHook(() => useKeyboardNavigation())
      pressKey('j')
      expect(useWorkspaceStore.getState().selectedRowId).toBe('A')

      unmount()
      useWorkspaceStore.setState({ selectedRowId: null })

      pressKey('j')
      expect(useWorkspaceStore.getState().selectedRowId).toBeNull()
    })
  })
})
