import { cn } from '@/lib/utils'
import {
  TitleBarLeftActions,
  TitleBarRightActions,
  TitleBarTitle,
  CommandPaletteHint,
} from './TitleBarContent'

interface LinuxTitleBarProps {
  className?: string
  title?: string
  repoPath?: string | null
}

/**
 * Linux title bar / toolbar.
 *
 * On Linux, native window decorations are used (decorations: true in config).
 * This component renders only the toolbar content without any window controls.
 * The native decorations provide close/minimize/maximize buttons.
 *
 * The toolbar sits below the native title bar and contains app-specific
 * toolbar buttons and the title.
 */
export function LinuxTitleBar({
  className,
  title,
  repoPath,
}: LinuxTitleBarProps) {
  return (
    <div
      className={cn(
        'relative flex h-[38px] w-full shrink-0 items-center justify-between border-b border-[color:var(--border)] bg-[color:var(--sidebar)]',
        className
      )}
    >
      {/* Left side - Actions */}
      <div className="flex items-center pl-2">
        <TitleBarLeftActions />
      </div>

      {/* Center - Title */}
      <TitleBarTitle title={title} repoPath={repoPath} />

      {/* Right side - Actions */}
      <div className="flex items-center gap-1 pr-2">
        <CommandPaletteHint />
        <TitleBarRightActions />
      </div>
    </div>
  )
}
