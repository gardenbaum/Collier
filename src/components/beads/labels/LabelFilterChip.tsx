/**
 * LabelFilterChip — render the active label filters as removable
 * chips. (T36, per the task spec; the plan called this
 * `LabelFilterSection` but the task brief specified the chip
 * shape.)
 *
 * Reads the active `labels` dimension from `useIssueFilterStore`
 * (T17) via the selector pattern. Renders one chip per active
 * label. Clicking a chip's `×` removes that label from the
 * store's `labels` array. The store's `toggleLabel` action is
 * used because the chip is only ever rendered for an active
 * label — toggling an active label removes it. Adding a fresh
 * label happens via `FilterSidebar`'s checkbox section, not
 * here.
 *
 * If the active list is empty, the component renders nothing
 * (no header, no "no filters" placeholder) — its purpose is
 * to make the active filters visible and removable; absence is
 * the natural state.
 *
 * State onion (per AGENTS.md):
 *   - The active label list → `useIssueFilterStore` (Zustand
 *     global UI; this is the "global UI" half of the onion).
 *   - No local `useState`, no TanStack Query.
 *
 * Hard-edged Bauhaus: mono only, hard edges, inline `style` with
 * design tokens. The brand colour is reserved for destructive + P0
 * per AC-14 — filter chips never reach for it. No animations, no
 * transitions, no shadow, no radius.
 */
import type { CSSProperties } from 'react'
import { X } from 'lucide-react'
import { colors, space, type } from '@/lib/design-tokens'
import { useIssueFilterStore } from '@/store/issue-filter-store'

export interface LabelFilterChipProps {
  /** Optional class-name extension on the wrapper. */
  className?: string
}

/**
 * The active-filter chip row. Renders nothing when the store's
 * `labels` array is empty.
 */
export function LabelFilterChip({ className }: LabelFilterChipProps) {
  // ponytail: 2 separate selectors — never destructure the whole
  // store (per AGENTS.md, that would re-render on every unrelated
  // change). `toggleLabel` is the active-remove contract: for a
  // chip rendered against an active filter, toggling always
  // removes (the store treats `labels.includes(l) ? filter : push`
  // as the toggle).
  const activeLabels = useIssueFilterStore(state => state.labels)
  const toggleLabel = useIssueFilterStore(state => state.toggleLabel)

  if (activeLabels.length === 0) {
    return null
  }

  return (
    <div
      data-testid="label-filter-chip-bar"
      className={className}
      style={containerStyle}
    >
      {activeLabels.map(label => (
        <span
          key={label}
          data-testid="label-filter-chip"
          data-label={label}
          style={chipStyle}
        >
          <span style={labelTextStyle}>{label}</span>
          <button
            type="button"
            data-testid="label-filter-chip-remove"
            onClick={() => toggleLabel(label)}
            aria-label={`Remove filter for ${label}`}
            style={removeButtonStyle}
          >
            <X size={10} aria-hidden="true" />
          </button>
        </span>
      ))}
    </div>
  )
}

const containerStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: space[2],
}

const chipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: space[1],
  height: 18,
  paddingInline: space[2],
  backgroundColor: colors.mono8,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.mono3,
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.xs,
  fontWeight: type.fontWeight.medium,
  lineHeight: type.lineHeight.tight,
  color: colors.mono0,
}

const labelTextStyle: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  fontSize: type.fontSize.xs,
  color: colors.mono0,
}

const removeButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 12,
  height: 12,
  padding: 0,
  margin: 0,
  background: 'transparent',
  border: 0,
  color: colors.mono0,
  cursor: 'pointer',
}

export default LabelFilterChip
