/**
 * FilterSidebar — left-rail filter panel for the issues view.
 *
 * ponytail: 5 sections of checkboxes, each bound to one dimension in
 * `useIssueFilterStore`. State lives entirely in the store (single source
 * of truth); the component is a pure projection + dispatch. Future
 * `IssueListView` (T15) reads from the same store, so toggling a box
 * here automatically narrows the list there via shared store state +
 * a shared TanStack Query key (when T15 lands).
 *
 * Hard-edged Bauhaus: radius 0, mono scale only, the brand colour is
 * reserved for destructive + P0 (per AC-14). No animations, no Tailwind
 * for the visual tokens — inline `style` keeps the contract obvious.
 *
 * Labels and assignees have no data source yet (T15 fetches them), so
 * the two sections render an "empty" placeholder. Wire them up when
 * the data layer lands.
 */
import type { CSSProperties } from 'react'
import type { ReactElement } from 'react'
import type { IssuePriority, IssueStatus, IssueType } from '@/lib/bindings'
import { colors, space, type } from '@/lib/design-tokens'
import { useIssueFilterStore } from '@/store/issue-filter-store'

const STATUS_OPTIONS: IssueStatus[] = [
  'open',
  'in_progress',
  'blocked',
  'closed',
  'deferred',
]

const PRIORITY_OPTIONS: IssuePriority[] = ['P0', 'P1', 'P2', 'P3', 'P4']

const TYPE_OPTIONS: IssueType[] = [
  'bug',
  'feature',
  'task',
  'epic',
  'chore',
  'decision',
  'gate',
]

const containerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[4],
  padding: space[4],
  backgroundColor: colors.mono9,
  color: colors.mono0,
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.sm,
  lineHeight: type.lineHeight.normal,
  minWidth: 200,
  height: '100%',
  overflowY: 'auto',
}

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space[2],
  paddingBottom: space[2],
  borderBottom: `1px solid ${colors.mono7}`,
}

const clearButtonStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.xs,
  fontWeight: type.fontWeight.medium,
  color: colors.mono0,
  backgroundColor: colors.mono8,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.mono3,
  paddingInline: space[2],
  paddingBlock: space[1],
  cursor: 'pointer',
}

const clearButtonDisabledStyle: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.xs,
  fontWeight: type.fontWeight.medium,
  color: colors.mono5,
  backgroundColor: colors.mono8,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.mono7,
  paddingInline: space[2],
  paddingBlock: space[1],
  cursor: 'not-allowed',
}

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: space[2],
}

const sectionHeadingStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: space[1],
  fontSize: type.fontSize.sm,
  fontWeight: type.fontWeight.bold,
  lineHeight: type.lineHeight.tight,
  margin: 0,
  textTransform: 'uppercase',
  letterSpacing: 0.4,
}

const sectionCountStyle: CSSProperties = {
  fontSize: type.fontSize.xs,
  fontWeight: type.fontWeight.regular,
  color: colors.mono5,
}

const optionStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: space[2],
  fontSize: type.fontSize.sm,
  color: colors.mono0,
  cursor: 'pointer',
}

const emptyStyle: CSSProperties = {
  fontSize: type.fontSize.xs,
  color: colors.mono5,
  fontStyle: 'italic',
}

/**
 * Build a `<label>` for a single option. `data-testid` and `data-value`
 * are the QA contract; React's controlled `checked` keeps the input in
 * sync with the store.
 */
function CheckboxOption({
  testId,
  value,
  label,
  checked,
  onToggle,
}: {
  testId: string
  value: string
  label: string
  checked: boolean
  onToggle: () => void
}): ReactElement {
  return (
    <label data-testid={testId} data-value={value} style={optionStyle}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        aria-label={label}
      />
      {label}
    </label>
  )
}

export interface FilterSidebarProps {
  /** Optional label/assignee options. Empty arrays render the "no X yet" placeholder. */
  labels?: string[]
  assignees?: string[]
}

/**
 * Left-rail filter panel. Renders 5 sections (status, priority, type,
 * labels, assignees) with a count badge per section and a "Clear all"
 * button at the top. Every checkbox is two-way bound to
 * `useIssueFilterStore` via selector dispatch.
 */
export function FilterSidebar({
  labels = [],
  assignees = [],
}: FilterSidebarProps): ReactElement {
  // ponytail: 5 separate selectors — never destructure the whole store
  // (per AGENTS.md, this would re-render on every unrelated change).
  const status = useIssueFilterStore(s => s.status)
  const priority = useIssueFilterStore(s => s.priority)
  const issueType = useIssueFilterStore(s => s.type)
  const storeLabels = useIssueFilterStore(s => s.labels)
  const storeAssignees = useIssueFilterStore(s => s.assignees)

  const toggleStatus = useIssueFilterStore(s => s.toggleStatus)
  const togglePriority = useIssueFilterStore(s => s.togglePriority)
  const toggleType = useIssueFilterStore(s => s.toggleType)
  const toggleLabel = useIssueFilterStore(s => s.toggleLabel)
  const toggleAssignee = useIssueFilterStore(s => s.toggleAssignee)
  const clearAll = useIssueFilterStore(s => s.clearAll)

  const totalCount =
    status.length +
    priority.length +
    issueType.length +
    storeLabels.length +
    storeAssignees.length

  const clearDisabled = totalCount === 0

  return (
    <aside data-testid="filter-sidebar" style={containerStyle}>
      <div style={headerStyle}>
        <h2 style={sectionHeadingStyle}>Filters</h2>
        <button
          type="button"
          data-testid="clear-all-button"
          onClick={clearAll}
          disabled={clearDisabled}
          style={clearDisabled ? clearButtonDisabledStyle : clearButtonStyle}
        >
          Clear all
        </button>
      </div>

      <section data-testid="status-section" style={sectionStyle}>
        <h3 style={sectionHeadingStyle}>
          Status <span style={sectionCountStyle}>({status.length})</span>
        </h3>
        {STATUS_OPTIONS.map(s => (
          <CheckboxOption
            key={s}
            testId={`status-option-${s}`}
            value={s}
            label={s.replace(/_/g, ' ')}
            checked={status.includes(s)}
            onToggle={() => toggleStatus(s)}
          />
        ))}
      </section>

      <section data-testid="priority-section" style={sectionStyle}>
        <h3 style={sectionHeadingStyle}>
          Priority <span style={sectionCountStyle}>({priority.length})</span>
        </h3>
        {PRIORITY_OPTIONS.map(p => (
          <CheckboxOption
            key={p}
            testId={`priority-option-${p}`}
            value={p}
            label={p}
            checked={priority.includes(p)}
            onToggle={() => togglePriority(p)}
          />
        ))}
      </section>

      <section data-testid="type-section" style={sectionStyle}>
        <h3 style={sectionHeadingStyle}>
          Type <span style={sectionCountStyle}>({issueType.length})</span>
        </h3>
        {TYPE_OPTIONS.map(t => (
          <CheckboxOption
            key={t}
            testId={`type-option-${t}`}
            value={t}
            label={t}
            checked={issueType.includes(t)}
            onToggle={() => toggleType(t)}
          />
        ))}
      </section>

      <section data-testid="labels-section" style={sectionStyle}>
        <h3 style={sectionHeadingStyle}>
          Labels <span style={sectionCountStyle}>({storeLabels.length})</span>
        </h3>
        {labels.length === 0 ? (
          <div data-testid="labels-empty" style={emptyStyle}>
            No labels yet
          </div>
        ) : (
          labels.map(l => (
            <CheckboxOption
              key={l}
              testId={`label-option-${l}`}
              value={l}
              label={l}
              checked={storeLabels.includes(l)}
              onToggle={() => toggleLabel(l)}
            />
          ))
        )}
      </section>

      <section data-testid="assignees-section" style={sectionStyle}>
        <h3 style={sectionHeadingStyle}>
          Assignees{' '}
          <span style={sectionCountStyle}>({storeAssignees.length})</span>
        </h3>
        {assignees.length === 0 ? (
          <div data-testid="assignees-empty" style={emptyStyle}>
            No assignees yet
          </div>
        ) : (
          assignees.map(a => (
            <CheckboxOption
              key={a}
              testId={`assignee-option-${a}`}
              value={a}
              label={a}
              checked={storeAssignees.includes(a)}
              onToggle={() => toggleAssignee(a)}
            />
          ))
        )}
      </section>
    </aside>
  )
}

export default FilterSidebar
