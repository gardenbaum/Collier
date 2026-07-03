/**
 * Extract a human-readable message from a Tauri / bd error union.
 *
 * ponytail: BdError is a tagged union with 10 variants. We collapse it
 * to a single string for rendering:
 *   - NonZeroExit surfaces stderr as `bd failed: <stderr>` so the
 *     user sees the real failure reason from the CLI.
 *   - Any other variant with a `message` returns that.
 *   - Otherwise falls back to the variant's `type` discriminator so
 *     even half-formed errors give the user a clue.
 *
 * Non-Tauri cases:
 *   - `Error` instances surface `err.message`.
 *   - Anything else falls through to `fallback` when supplied,
 *     else `String(err)` so the caller never renders `undefined`.
 *
 * Previously this helper lived as a local `formatError` in 8 views
 * (5 byte-identical "Variant A" copies and 3 incomplete "Variant B"
 * copies missing the Tauri-union handling). Extracted so error
 * formatting is consistent across all views.
 */
export function formatError(err: unknown, fallback?: string): string {
  if (err && typeof err === 'object' && 'type' in err) {
    const e = err as { type: string; message?: string; stderr?: string }
    if (e.type === 'NonZeroExit' && e.stderr) return `bd failed: ${e.stderr}`
    if ('message' in e && e.message) return e.message
    return e.type
  }
  if (err instanceof Error) return err.message
  return fallback ?? String(err)
}
