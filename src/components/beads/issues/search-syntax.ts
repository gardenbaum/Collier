/**
 * Detect query-language operators in the user input. The regex is
 * permissive on purpose — `bd query` is the authoritative parser, and
 * a false positive just sends plain text to the query engine (which
 * returns an empty list, no harm). The pattern matches the four
 * comparison operators plus the documented field names.
 *
 * Extracted from `SearchView.tsx` so the file can stay component-only
 * (React fast-refresh then works for the component without invalidating
 * the search helper on every save).
 */
export const hasQueryOperator = (q: string): boolean =>
  /[:=><]|\bstate:|\bpriority:|\btype:|\blabel:|\bassignee:|\bowner:/.test(q)
