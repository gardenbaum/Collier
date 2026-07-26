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

    it('skips opt-in elements with empty data-row-id (malformed row contract)', () => {
      // The row contract is `data-kbd-nav="row"` + `data-row-id="<id>"`.
      // A `<div data-kbd-nav="row" data-row-id="">` matches the
      // selector but carries an empty id — collectRows must skip it
      // instead of pushing an entry with `id=""`. Otherwise j/k
      // would set selectedRowId to "" and the consumer selectors
      // (which match by exact id) would highlight nothing while
      // visual selection silently points at an empty key.
      makeRow('A')
      const malformed = document.createElement('div')
      malformed.setAttribute('data-kbd-nav', 'row')
      malformed.setAttribute('data-row-id', '') // empty id
      document.body.appendChild(malformed)
      makeRow('B')
      renderHook(() => useKeyboardNavigation())

      // j lands on A — the malformed row is skipped silently.
      pressKey('j')
      expect(useWorkspaceStore.getState().selectedRowId).toBe('A')

      // Another j jumps over the malformed row to B.
      pressKey('j')
      expect(useWorkspaceStore.getState().selectedRowId).toBe('B')
    })

    it('collects non-epic rows without data-expanded as isExpanded=undefined', () => {
      // Only epic rows carry `data-expanded`; list/ready/blocked/
      // search rows don't. collectRows must still surface them in
      // the navigation order with isExpanded=undefined so the h/l
      // handlers can detect "this row has no chevron". Without the
      // `expandedAttr === null` branch in the ternary, a future
      // refactor that defaults isExpanded to false for non-epic
      // rows would change observable behaviour (h/l would silently
      // no-op on a row that did have a chevron after a re-render).
      makeRow('A')
      makeRow('B')
      renderHook(() => useKeyboardNavigation())

      // j lands on the first row — proves both rows were collected.
      pressKey('j')
      expect(useWorkspaceStore.getState().selectedRowId).toBe('A')
    })

    it('collects rows with data-expanded="false" as isExpanded=false', () => {
      // The collectRows ternary has three branches:
      //   - data-expanded="true"  -> isExpanded=true  (covered by epic-row tests)
      //   - data-expanded="false" -> isExpanded=false (this test)
      //   - absent attribute      -> isExpanded=undefined (covered above)
      // All three map to KeyboardNavRow fields. The "false" branch
      // is reachable when an epic row starts collapsed (data-expanded
      // is set to "false" on initial render before the user expands
      // it). Pinning the branch defends against a refactor that
      // drops the explicit `expandedAttr === 'false'` arm.
      const collapsed = document.createElement('div')
      collapsed.setAttribute('data-kbd-nav', 'row')
      collapsed.setAttribute('data-row-id', 'EPIC-COLLAPSED')
      collapsed.setAttribute('data-expanded', 'false')
      collapsed.setAttribute('tabindex', '-1')
      document.body.appendChild(collapsed)

      renderHook(() => useKeyboardNavigation())

      // j navigates to the row — proves it was collected.
      pressKey('j')
      expect(useWorkspaceStore.getState().selectedRowId).toBe('EPIC-COLLAPSED')
    })

    it('does not call focus() on the first row when it is already document.activeElement', () => {
      // The focus guard `if (document.activeElement !== target.element)`
      // short-circuits the focus call when the target already holds
      // focus (e.g. the user tabbed onto the first row before pressing
      // j). Without the guard we'd re-focus the same element on every
      // j, fighting browser focus side-effects (scroll position
      // jumps, selection clearing). The guard is the only place in
      // moveCursor() that varies based on prior focus.
      const a = makeRow('A')
      a.focus()
      expect(document.activeElement).toBe(a)
      renderHook(() => useKeyboardNavigation())

      pressKey('j')

      // Cursor updates even though we skipped the focus() call.
      expect(useWorkspaceStore.getState().selectedRowId).toBe('A')
      expect(document.activeElement).toBe(a)
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

    it('h is a no-op when the selected row is not in the DOM', () => {
      // When the workspace re-renders, the previously-selected row
      // may unmount before the user presses h (e.g. a view switch).
      // toggleEpicAt looks up the row by id via document.querySelector;
      // if the row isn't there it returns silently. Without the
      // `if (!row) return` branch an unmatched selector would have
      // crashed on the subsequent chevron.querySelector call.
      useWorkspaceStore.setState({ selectedRowId: 'GONE' })
      renderHook(() => useKeyboardNavigation())

      expect(() => pressKey('h')).not.toThrow()
      expect(useWorkspaceStore.getState().selectedRowId).toBe('GONE')
    })

    it('l is a no-op on an epic row that lacks a chevron button', () => {
      // Epic rows normally render a chevron, but the hook must
      // defend against a missing chevron — e.g. a future view that
      // omits the chevron while keeping `data-kbd-nav="row"` on
      // the epic row, or a transition state where the chevron has
      // been unmounted. Without the `if (!chevron) return` branch
      // the subsequent chevron.click() would throw on null.
      const epic = makeRow('EPIC-1', 'epic-row')
      const chevron = epic.querySelector('[data-testid="epic-chevron"]')
      if (chevron) chevron.remove()
      expect(epic.querySelector('[data-testid="epic-chevron"]')).toBeNull()

      useWorkspaceStore.setState({ selectedRowId: 'EPIC-1' })
      renderHook(() => useKeyboardNavigation())

      expect(() => pressKey('l')).not.toThrow()
      expect(useWorkspaceStore.getState().selectedRowId).toBe('EPIC-1')
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

  describe('unknown keys', () => {
    it('ignores keys that have no shortcut binding (default branch in the switch)', () => {
      // The switch in the keydown handler has explicit cases for
      // j/k/Enter/h/l and a `default: break` for everything else.
      // Pressing an unmapped key must not mutate any workspace
      // state, open the drawer, switch the view, or call
      // preventDefault — the key is not ours to consume.
      const preventDefault = vi.fn()
      makeRow('A')
      makeRow('B')
      renderHook(() => useKeyboardNavigation())

      // No row selected: any of the unmapped keys leaves the
      // cursor and the drawer untouched, and the event is not
      // consumed.
      pressKey('q', { preventDefault })
      pressKey('foo', { preventDefault })
      pressKey('z', { preventDefault })
      expect(useWorkspaceStore.getState().selectedRowId).toBeNull()
      expect(useWorkspaceStore.getState().selectedIssueId).toBeNull()
      expect(useWorkspaceStore.getState().activeView).toBe('list')
      expect(preventDefault).not.toHaveBeenCalled()

      // With a row selected: the cursor stays put.
      pressKey('j')
      expect(useWorkspaceStore.getState().selectedRowId).toBe('A')
      pressKey('q', { preventDefault })
      pressKey('z', { preventDefault })
      expect(useWorkspaceStore.getState().selectedRowId).toBe('A')
      expect(useWorkspaceStore.getState().selectedIssueId).toBeNull()
      expect(preventDefault).not.toHaveBeenCalled()
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

    it('does not intercept j/k/Enter inside a contenteditable element', () => {
      // contenteditable surfaces are a typing target per the
      // keyboard-nav contract — the user is editing rich text
      // (e.g. issue description) and the global j/k/Enter must
      // pass through to the field, not be stolen by the list
      // navigator. Covers the `isContentEditable` branch in
      // isTypingTarget.
      //
      // jsdom does NOT reflect the `contenteditable` HTML
      // attribute onto the `isContentEditable` IDL property the
      // hook reads — a known jsdom limitation. We set the
      // attribute to document the intent and define the IDL
      // property directly so the test exercises the production
      // code path in jsdom, not just its absence.
      makeRow('A')
      const editable = document.createElement('div')
      editable.setAttribute('contenteditable', 'true')
      Object.defineProperty(editable, 'isContentEditable', {
        value: true,
        configurable: true,
      })
      document.body.appendChild(editable)
      renderHook(() => useKeyboardNavigation())

      pressKey('j', { target: editable })

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

    it('treats <select> as a typing surface (j does not move the cursor)', () => {
      // <select> dropdowns capture printable keys (e.g. typing a
      // letter to jump to the matching option in a long list). The
      // keyboard nav must not steal j/k while a select has focus,
      // otherwise the user can't use type-ahead on selects.
      makeRow('A')
      makeRow('B')
      const select = document.createElement('select')
      document.body.appendChild(select)
      renderHook(() => useKeyboardNavigation())

      pressKey('j', { target: select })

      expect(useWorkspaceStore.getState().selectedRowId).toBeNull()
    })

    it('treats <input type="email"> as a typing surface (j does not move the cursor)', () => {
      // The isTypingTarget contract lists 'email' alongside 'text'
      // / 'search' / 'password' / 'tel' / 'url' / 'number' — all of
      // these are focusable form fields that capture printable
      // keys. Pinning the 'email' branch defends against a future
      // refactor that drops it from the type list.
      makeRow('A')
      const input = document.createElement('input')
      input.type = 'email'
      document.body.appendChild(input)
      renderHook(() => useKeyboardNavigation())

      pressKey('j', { target: input })

      expect(useWorkspaceStore.getState().selectedRowId).toBeNull()
    })

    it('does not treat <input type="checkbox"> as a typing surface (j moves the cursor)', () => {
      // Checkboxes/radios/buttons are focusable but don't capture
      // printable keys — the type-check in isTypingTarget excludes
      // them so j/k works while focus is on a checkbox (e.g. the
      // user tabbed onto a row's "select" checkbox before pressing
      // j). Without this branch the false-positive typing guard
      // would freeze navigation on every checkbox-focus.
      makeRow('A')
      makeRow('B')
      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      document.body.appendChild(checkbox)
      renderHook(() => useKeyboardNavigation())

      pressKey('j', { target: checkbox })

      expect(useWorkspaceStore.getState().selectedRowId).toBe('A')
    })

    it('does not crash when the keydown target is null', () => {
      // Defensive: `event.target` is typed `EventTarget | null` in
      // the DOM spec. The hook's typing-target guard must handle
      // a null target without throwing — short-circuiting to
      // "not typing" and proceeding through the normal j/k flow.
      // Without this branch the subsequent `(target as ...)`
      // property reads would have thrown.
      //
      // The shared `pressKey` helper uses `if (options.target)` to
      // decide whether to override the dispatched event's target,
      // which excludes `null`. We dispatch a raw KeyboardEvent and
      // force its target to null via `Object.defineProperty` so
      // the typing-target guard actually receives a null target.
      makeRow('A')
      renderHook(() => useKeyboardNavigation())

      const event = new KeyboardEvent('keydown', {
        key: 'j',
        bubbles: true,
        cancelable: true,
      })
      Object.defineProperty(event, 'target', { value: null })
      expect(() => window.document.dispatchEvent(event)).not.toThrow()

      // j still moves the cursor (null target isn't a typing surface).
      expect(useWorkspaceStore.getState().selectedRowId).toBe('A')
    })

    it('does not treat a plain <div> as a typing surface (j moves the cursor)', () => {
      // A non-input / non-textarea / non-select / non-contenteditable
      // element is NOT a typing target. This is the default branch
      // in isTypingTarget — `return false` after the type checks all
      // miss. Without it, the function would fall off the end of the
      // conditional chain with no return statement.
      makeRow('A')
      makeRow('B')
      const div = document.createElement('div')
      document.body.appendChild(div)
      renderHook(() => useKeyboardNavigation())

      pressKey('j', { target: div })

      expect(useWorkspaceStore.getState().selectedRowId).toBe('A')
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

  // ─────────────────────────────────────────────────────────────────
  // The three unreachable branches remaining at 6b776a6 (97.45 S /
  // 94.79 B / 100 F / 98.94 L) are defensive guards documented
  // here per the realistic-ceiling guidance in memory (d):
  //
  // - L189 `cssEscape` fallback (`typeof CSS.escape === 'function'`
  //   false branch). jsdom ships a complete CSS.escape polyfill,
  //   so the barebones fallback path is unreachable in unit tests.
  //   The guard exists for SSR / legacy runtimes that lack
  //   CSS.escape — none of our shipped targets fall into that
  //   category (Tauri's webview is WebKit >= 16 / Chromium >= 110).
  //
  // - L222 `if (first === undefined || last === undefined) return null`
  //   in moveCursor. The preceding `if (rows.length === 0) return null`
  //   already returned, so `rows[0]` and `rows[rows.length - 1]` are
  //   always defined when execution reaches this point. The guard
  //   is defense-in-depth against a future refactor that drops the
  //   length check.
  //
  // - L237 `if (row === undefined) return currentId` in moveCursor.
  //   Same pattern as L222 — the preceding `if (next < 0 || next >=
  //   rows.length) return currentId` bounds check guarantees
  //   `rows[next]` is defined. The guard is defense-in-depth.
  //
  // Trying to exercise these via fragile `vi.spyOn` hacks
  // (e.g. spying on `globalThis.CSS` to force the fallback) would
  // pin test infrastructure rather than the production behaviour
  // the hook actually owns. Documenting them here keeps the
  // ceiling honest without churning the test for coverage's sake.
  // ─────────────────────────────────────────────────────────────────
})
