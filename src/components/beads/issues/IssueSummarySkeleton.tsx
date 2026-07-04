/**
 * IssueSummarySkeleton — 3-row loading placeholder for the summary
 * lists (`BlockedView`, `ReadyView`).
 *
 * Why this exists
 * ---------------
 * The skeleton markup is byte-identical between `BlockedView` and
 * `ReadyView` apart from the `blocked-loading` / `ready-loading`
 * testid, and was extracted together with `IssueSummaryRow` to
 * eliminate the same jscpd clone surface.
 *
 * ponytail: the existing `BlockedView.test.tsx` /
 * `ReadyView.test.tsx` suites assert `data-testid="${prefix}-loading"`
 * and the mutual exclusion of `loading` / `error` / `empty` / `list`
 * — this component is the only thing that renders the loading
 * state, so the testid is the contract.
 */
import {
  containerStyle,
  skeletonStyle,
  skeletonBarStyle,
} from './issue-summary-styles'

export interface IssueSummarySkeletonProps {
  /**
   * Testid prefix; the wrapper emits
   * `data-testid="${testidPrefix}-loading"`.
   * Existing callers pass `"blocked"` or `"ready"`.
   */
  testidPrefix: string
}

export function IssueSummarySkeleton({
  testidPrefix,
}: IssueSummarySkeletonProps) {
  return (
    <div data-testid={`${testidPrefix}-loading`} style={containerStyle}>
      {[0, 1, 2].map(i => (
        <div key={i} style={skeletonStyle}>
          <div style={{ ...skeletonBarStyle, width: 8, height: 8 }} />
          <div style={{ ...skeletonBarStyle, width: 14, height: 14 }} />
          <div
            style={{ ...skeletonBarStyle, width: 80, height: 16, flex: 1 }}
          />
        </div>
      ))}
    </div>
  )
}
