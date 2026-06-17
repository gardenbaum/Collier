/**
 * Bootstrap flow components for the beads workspace.
 *
 * Each export corresponds to a "gate" the user must clear before the
 * main issue views render. The order of evaluation in the parent
 * (App.tsx, Wave 8) is:
 *
 *   1. BdNotInPath       — `bd` CLI missing on PATH
 *   2. BdInitFlow         — workspace has no `.beads/` dir
 *   3. BdRepoSelect       — pick a repo (post-init / cold start)
 *
 * Subsequent gates (T12–T14, T9 companion) are wired as they land.
 */

export { BdNotInPath } from './BdNotInPath'
export { RepoSelection } from './RepoSelection'
export { BdInitFlow } from './BdInitFlow'
export { VersionCheck } from './VersionCheck'
export { SchemaCheck } from './SchemaCheck'
