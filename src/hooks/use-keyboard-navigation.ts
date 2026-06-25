/**
 * useKeyboardNavigation — M5 vim-style navigation for the main window.
 *
 * Wires up the global keyboard shortcuts that drive the active list
 * view:
 *   - `j`           select next visible row
 *   - `k`           select previous visible row
 *   - `Enter`       open the selected row's issue (IssueDetailDrawer)
 *   - `Escape`      close the open drawer, or clear the row cursor
 *                   when no drawer is open
 *   - `/`           switch to the search view and focus the search
 *                   input
 *   - `h`           collapse the current epic (epic view only)
 *   - `l`           expand the current epic (epic view only)
 *
 * Design rules:
 *   1. **Input guard.** When focus is inside an `<input>`, `<textarea>`
 *      or `contenteditable` element, the j/k/Enter/h/l keys are NOT
 *      intercepted — the user is editing text and we must not steal
 *      those keystrokes. Escape is still honoured so the user can
 *      blur the field (drawer close / cursor clear applies). The `/`
 *      shortcut is the single exception because it specifically means
 *      "leave the current input and go search" (matches GitHub /
 *      Linear / vim conventions).
 *   2. **Overlay guard.** When the command palette or the issue
 *      detail drawer is open, the j/k navigation passes through to
 *      the overlay's own list widget. Esc is owned by the overlay.
 *   3. **Cursor lifecycle.** The keyboard cursor lives in
 *      `useWorkspaceStore.selectedRowId`. Each view (list, epic,
 *      dep-graph, …) reads it and highlights its own row. j/k find
 *      the next/prev rendered row by walking the DOM in document
 *      order — the virtualizer only mounts ~15 rows at a time so a
 *      single j/k always lands on an adjacent mounted row, never
 *      requiring the virtualizer to scroll.
 *   4. **No globals leakage.** The hook does not register a
 *      global event listener beyond the document keydown handler
 *      used by every other shortcut in the app. Listeners are
 *      removed on unmount.
 *
 * Integration:
 *   - `MainWindowContent` mounts the hook once per app session.
 *   - `IssueListView`, `EpicView`, `ReadyView`, `BlockedView`,
 *     `SearchView` render `data-row-selected="true"` on the row
 *     whose id matches `selectedRowId` (read via a small
 *     selector hook in each component).
 */
import { useEffect } from 'react'
import { useUIStore } from '@/store/ui-store'
import { useWorkspaceStore } from '@/store/workspace-store'

/**
 * Selector shared by every list view: the elements that participate
 * in keyboard navigation. Each row carries:
 *   - `data-kbd-nav="row"` — opts the element into the keyboard nav
 *     contract (the hook walks only elements with this attribute).
 *   - `data-row-id="<issue-id>"` — the issue id the row represents;
 *     `h`/`l` use it to find the right epic chevron.
 *
 * We intentionally do NOT use `data-testid` for this — every view
 * has its own readable testid (`issue-row`, `ready-row`,
 * `blocked-row`, `search-result-row`, `epic-row`, `epic-child-row`)
 * and adding `data-testid="issue-row"` to a `ready-row` element
 * would clash with the existing test suite (`getByTestId` is an
 * exact match). `data-kbd-nav` is a parallel, opt-in contract so
 * the existing testids stay untouched.
 */
export interface KeyboardNavRow {
  id: string
  element: HTMLElement
  /** Optional: epic rows carry the epic id (== the row id), but the
   *  epic-view row also knows whether it is currently expanded. */
  isExpanded?: boolean
}

const ROW_SELECTOR = '[data-kbd-nav="row"][data-row-id]'

/**
 * Walk the DOM in document order and return the rows visible in the
 * active viewport. Falls back to `data-issue-id` when the row doesn't
 * carry `data-epic-id` (i.e. for list-style rows). The list is
 * filtered to elements currently in the DOM (the virtualizer
 * unmounts off-screen rows, so the DOM order is the only thing that
 * matters — we never read the full underlying data array here).
 */
function collectRows(): KeyboardNavRow[] {
  const nodes = document.querySelectorAll<HTMLElement>(ROW_SELECTOR)
  const rows: KeyboardNavRow[] = []
  for (const node of Array.from(nodes)) {
    const id = node.getAttribute('data-row-id')
    if (id === null || id.length === 0) continue
    const expandedAttr = node.getAttribute('data-expanded')
    rows.push({
      id,
      element: node,
      isExpanded:
        expandedAttr === 'true'
          ? true
          : expandedAttr === 'false'
            ? false
            : undefined,
    })
  }
  return rows
}

/**
 * `true` when the active focus target is a text input the user is
 * actively typing into. We treat `<input>` (with the exception of
 * type=checkbox/radio/button which don't capture text), `<textarea>`,
 * `<select>` and `contenteditable` elements as "typing" surfaces.
 * `Escape` is still allowed even inside one — clearing focus is a
 * common, expected behaviour.
 */
function isTypingTarget(target: EventTarget | null): boolean {
  if (target === null) return false
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'TEXTAREA') return true
  if (tag === 'SELECT') return true
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type
    // The bare `<input type="text">` is the typing surface we want
    // to protect. Buttons / checkboxes / radios are focusable but
    // they don't capture printable keys.
    if (
      type === 'text' ||
      type === 'search' ||
      type === 'email' ||
      type === 'password' ||
      type === 'tel' ||
      type === 'url' ||
      type === 'number'
    ) {
      return true
    }
  }
  if (target.isContentEditable) return true
  return false
}

const FOCUS_SEARCH_EVENT = 'collier:focus-search-input'

/**
 * Imperatively focus the search input. Dispatched by the keyboard
 * hook on `/`; listened to by `SearchView`. Also useful from the
 * command palette ("Go to search…" command) — both paths share the
 * same event so the focus behaviour is identical.
 */
export function focusSearchInput(): void {
  window.dispatchEvent(new CustomEvent(FOCUS_SEARCH_EVENT))
}

/**
 * Toggle an epic's expand/collapse state. Reads the epic-view
 * component's row buttons via the DOM: the chevron carries
 * `data-testid="epic-chevron"` and a sibling `data-issue-id` on
 * the row. We click it programmatically — EpicView owns the state,
 * we just route the keystroke.
 */
function toggleEpicAt(id: string, expand: boolean): void {
  // Find the chevron inside the epic row matching `id`. The
  // epic-row uses `data-kbd-nav="row"` + `data-row-id` (same
  // contract as every other keyboard-navigable row), so we look
  // it up via the keyboard-nav selector and then drill into its
  // chevron button.
  const row = document.querySelector<HTMLElement>(
    `[data-kbd-nav="row"][data-row-id="${cssEscape(id)}"]`
  )
  if (!row) return
  const chevron = row.querySelector<HTMLElement>('[data-testid="epic-chevron"]')
  if (!chevron) return
  const currentlyExpanded = chevron.getAttribute('data-expanded') === 'true'
  if (currentlyExpanded === expand) return
  chevron.click()
}

/**
 * Minimal CSS.escape polyfill — `CSS.escape` exists in every browser
 * we ship to (Tauri's webview is WebKit >= 16 / Chromium >= 110) but
 * the keyboard-nav hook is mounted during SSR-rendered test runs in
 * jsdom, which ships an incomplete polyfill. Guard with `typeof` so
 * unit tests in jsdom still resolve.
 */
function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value)
  }
  // Barebones fallback for jsdom: replace any non-identifier char.
  return value.replace(/[^a-zA-Z0-9_-]/g, '\\$&')
}

/**
 * Move the keyboard cursor to the row adjacent to `currentId` in the
 * `direction` (1 = forward = j, -1 = backward = k). Returns the new
 * row id, or `currentId` when the cursor cannot move (no rows, single
 * row, already at an end).
 *
 * If `currentId` is not in the rendered slice (e.g. it was unmounted
 * by the virtualizer or is in a different view), we anchor on the
 * first rendered row so a stray j/k does not feel "stuck".
 *
 * The cursor and the keyboard focus stay in sync: when the row the
 * cursor moves to is in the DOM, we focus it (without scrolling —
 * the row was just rendered above/below, never off-screen, because
 * the virtualizer keeps a 2*OVERSCAN window of neighbours). This is
 * the half of the ARIA grid pattern that bridges the global
 * keydown hook with the focus model — the grid's
 * `aria-activedescendant` already mirrors `selectedRowId`, so AT
 * users hear the new row's content the moment focus moves.
 */
function moveCursor(
  currentId: string | null,
  direction: 1 | -1
): string | null {
  const rows = collectRows()
  if (rows.length === 0) return null
  const index =
    currentId === null ? -1 : rows.findIndex(r => r.id === currentId)
  if (index === -1) {
    const first = rows[0]
    const last = rows[rows.length - 1]
    if (first === undefined || last === undefined) return null
    const target = direction === 1 ? first : last
    // Sync the DOM focus with the cursor on the first navigation
    // out of "no cursor" — without this the roving tabindex's
    // active row would have visual selection (data-row-selected=true
    // after the state update) but no keyboard focus, leaving the
    // user unable to press Enter immediately after landing on it.
    if (document.activeElement !== target.element) {
      target.element.focus({ preventScroll: true })
    }
    return target.id
  }
  const next = index + direction
  if (next < 0 || next >= rows.length) return currentId
  const row = rows[next]
  if (row === undefined) return currentId
  // Sync the DOM focus with the cursor. `focus({ preventScroll: true })`
  // because we know the row is on-screen — the virtualizer already
  // mounted the row immediately above or below the previous cursor.
  // Without `preventScroll`, Safari would jump-scroll to the row even
  // when the virtualizer's natural translateY already positions it
  // correctly, fighting the smooth-scroll behaviour.
  if (document.activeElement !== row.element) {
    row.element.focus({ preventScroll: true })
  }
  return row.id
}

/**
 * Mount the global keydown handler. Returns nothing — the hook is
 * fire-and-forget; `MainWindowContent` calls it exactly once.
 */
export function useKeyboardNavigation(): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      // Modifier-laden keystrokes are owned by other shortcuts
      // (Cmd+K = palette, Cmd+, = preferences, Cmd+1 = sidebar,
      // etc.). Don't intercept those — the modifier check covers
      // every shortcut registered by useKeyboardShortcuts.
      if (event.metaKey || event.ctrlKey || event.altKey) return

      const commandPaletteOpen = useUIStore.getState().commandPaletteOpen
      const selectedIssueId = useWorkspaceStore.getState().selectedIssueId
      const selectedRowId = useWorkspaceStore.getState().selectedRowId
      const setSelectedRowId = useWorkspaceStore.getState().setSelectedRowId
      const openIssue = useWorkspaceStore.getState().openIssue

      // The drawer + the command palette own their own keydown
      // handling (Drawer swallows Escape to close itself; the
      // palette swallows everything while open). Don't fight them.
      const drawerOpen = selectedIssueId !== null
      if (drawerOpen) return
      if (commandPaletteOpen) return

      const typing = isTypingTarget(event.target)

      // `/` is special: even when typing in an input, we still
      // intercept it (matches GitHub / Linear / vim convention —
      // `/` always means "go search"). This is intentional and is
      // the only typing-surface shortcut.
      if (event.key === '/') {
        if (typing) {
          // Don't steal `/` when the user is literally typing it
          // (e.g. inside the search input itself or any other
          // text field). Only the bare keypress on the body
          // triggers the focus.
          return
        }
        event.preventDefault()
        useWorkspaceStore.getState().setActiveView('search')
        focusSearchInput()
        return
      }

      // Escape is the second exception: even when typing, we still
      // clear the keyboard cursor on Escape (matches the convention
      // that Escape always means "back out of the current mode").
      // The browser's default Escape behaviour on an input is to
      // blur it; we don't preventDefault, so both happen — the
      // field blurs AND the cursor clears.
      if (event.key === 'Escape') {
        if (selectedRowId !== null) {
          setSelectedRowId(null)
        }
        return
      }

      // For every other shortcut, bail when the user is typing.
      if (typing) return

      switch (event.key) {
        case 'j': {
          event.preventDefault()
          const next = moveCursor(selectedRowId, 1)
          if (next !== null) setSelectedRowId(next)
          break
        }
        case 'k': {
          event.preventDefault()
          const prev = moveCursor(selectedRowId, -1)
          if (prev !== null) setSelectedRowId(prev)
          break
        }
        case 'Enter': {
          if (selectedRowId === null) return
          event.preventDefault()
          openIssue(selectedRowId)
          break
        }
        case 'h': {
          // Collapse the current epic. Only meaningful on the
          // epic view; in any other view the chevron isn't
          // mounted and the call is a no-op.
          if (selectedRowId !== null) toggleEpicAt(selectedRowId, false)
          break
        }
        case 'l': {
          if (selectedRowId !== null) toggleEpicAt(selectedRowId, true)
          break
        }
        default:
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [])
}
