/**
 * ReadyView — lists issues that have no open dependencies
 * (`bd ready --json`).
 *
 * This file is now a thin wrapper around `StatusListView` that supplies
 * the per-status props for the ready IPC. The shared skeleton /
 * error / empty / row layout lives in `StatusListView` so the
 * BlockedView and ReadyView surfaces stay in lockstep.
 *
 * State onion (per AGENTS.md): server state lives in TanStack Query
 * (`['beads', 'ready']` keyspace), no local component state beyond
 * the loading / error / empty / populated branch.
 */
import { Inbox } from 'lucide-react'
import { commands } from '@/lib/tauri-bindings'
import { StatusListView } from './StatusListView'

export interface ReadyViewProps {
  /** Repository root. */
  cwd: string
}

/**
 * List view for `bd ready`. Skeleton → error → empty → populated.
 */
export function ReadyView({ cwd }: ReadyViewProps) {
  return (
    <StatusListView
      cwd={cwd}
      queryKey={['beads', 'ready']}
      queryFn={commands.bdReady}
      heading="Ready"
      testidPrefix="ready"
      emptyIcon={Inbox}
      emptyTitle="No ready work"
      emptyBody="When issues are unblocked, they'll show up here."
      errorFallback="Failed to load ready issues."
    />
  )
}
