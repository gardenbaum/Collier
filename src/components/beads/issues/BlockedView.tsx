/**
 * BlockedView — lists issues that have at least one open dependency
 * (`bd blocked --json`).
 *
 * This file is now a thin wrapper around `StatusListView` that supplies
 * the per-status props for the blocked IPC. The shared skeleton /
 * error / empty / row layout lives in `StatusListView` so the
 * BlockedView and ReadyView surfaces stay in lockstep.
 *
 * State onion (per AGENTS.md): server state lives in TanStack Query
 * (`['beads', 'blocked']` keyspace), no local component state beyond
 * the loading / error / empty / populated branch.
 */
import { Ban } from 'lucide-react'
import { commands } from '@/lib/tauri-bindings'
import { StatusListView } from './StatusListView'

export interface BlockedViewProps {
  /** Repository root. */
  cwd: string
}

/**
 * List view for `bd blocked`. Skeleton → error → empty → populated.
 */
export function BlockedView({ cwd }: BlockedViewProps) {
  return (
    <StatusListView
      cwd={cwd}
      queryKey={['beads', 'blocked']}
      queryFn={commands.bdBlocked}
      heading="Blocked"
      testidPrefix="blocked"
      emptyIcon={Ban}
      emptyTitle="Nothing blocked"
      emptyBody="Issues blocked by dependencies will appear here."
      errorFallback="Failed to load blocked issues."
    />
  )
}
