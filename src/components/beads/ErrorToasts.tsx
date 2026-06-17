/**
 * Error-toast helpers for the beads namespace.
 *
 * Thin wrappers over Sonner's `toast.error` that add the two
 * affordances the beads UI needs: a Retry action and a Details
 * description line. The components in this folder import these
 * helpers rather than calling `toast.error` directly so the
 * "beads error toast" shape lives in one place.
 *
 * Why a wrapper at all? Two reasons:
 *   1. Sonner's `toast.error(message, options)` signature has no
 *      convenience for "show a Retry button that invokes a callback
 *      on click"; every caller would re-implement the `action`
 *      shape. Centralising saves 6 lines per call site.
 *   2. The error-toast contract is a candidate for future
 *      i18n + deduplication (T48 spec: max 1 toast per error per 5s).
 *      Putting the call sites behind a stable helper means the
 *      dedup logic can be added in one file without touching
 *      consumers.
 */
import { toast } from 'sonner'

export interface ShowErrorOptions {
  /**
   * Optional retry callback. When provided, the toast renders a
   * "Retry" action button that invokes this function.
   */
  retry?: () => void
  /**
   * Optional longer-form detail (typically stderr or a JSON dump).
   * Shown as the toast description line.
   */
  details?: string
}

/**
 * Show a Sonner error toast with optional Retry action and detail
 * description. Best-effort: the caller never sees a thrown error
 * from Sonner.
 */
export function showError(message: string, options?: ShowErrorOptions): void {
  toast.error(message, {
    action: options?.retry
      ? { label: 'Retry', onClick: options.retry }
      : undefined,
    description: options?.details,
  })
}

/**
 * Convenience wrapper for the common "show an error with a Retry
 * button" pattern. Equivalent to
 * `showError(message, { retry, details })` but reads better at the
 * call site.
 */
export function showErrorWithRetry(
  message: string,
  retry: () => void,
  details?: string
): void {
  showError(message, { retry, details })
}
