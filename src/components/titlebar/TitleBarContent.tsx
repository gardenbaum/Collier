import { useTranslation } from 'react-i18next'
import { Command, PanelLeft, PanelLeftClose, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useUIStore } from '@/store/ui-store'
import { executeCommand, useCommandContext } from '@/lib/commands'
import { Monogram } from '@/components/atoms'

export function TitleBarLeftActions() {
  const { t } = useTranslation()
  const sidebarVisible = useUIStore(state => state.sidebarVisible)
  const toggleSidebar = useUIStore(state => state.toggleSidebar)
  return (
    <div className="flex items-center gap-1">
      <Button
        onClick={toggleSidebar}
        variant="ghost"
        size="icon"
        className="size-7 text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
        title={t(
          sidebarVisible
            ? 'titlebar.hideLeftSidebar'
            : 'titlebar.showLeftSidebar'
        )}
        data-testid="titlebar-toggle-left"
      >
        {sidebarVisible ? (
          <PanelLeftClose className="size-3.5" />
        ) : (
          <PanelLeft className="size-3.5" />
        )}
      </Button>
    </div>
  )
}

export function TitleBarRightActions() {
  const { t } = useTranslation()
  const commandContext = useCommandContext()
  const handleOpenPreferences = async () => {
    const result = await executeCommand('open-preferences', commandContext)
    if (!result.success && result.error)
      commandContext.showToast(result.error, 'error')
  }
  return (
    <div className="flex items-center gap-1">
      <Button
        onClick={handleOpenPreferences}
        variant="ghost"
        size="icon"
        className="size-7 text-[color:var(--muted-foreground)] hover:text-[color:var(--foreground)]"
        title={t('titlebar.settings')}
        data-testid="titlebar-settings"
      >
        <Settings className="size-3.5" />
      </Button>
    </div>
  )
}

interface TitleBarTitleProps {
  title?: string
  repoPath?: string | null
}

function repoBasename(path: string | null | undefined): string | null {
  if (!path) return null
  const parts = path.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? null
}

export function TitleBarTitle({
  title = 'Collier',
  repoPath,
}: TitleBarTitleProps) {
  const repo = repoBasename(repoPath)
  return (
    <div className="flex items-center gap-2 px-3 select-none">
      <Monogram size={18} data-testid="titlebar-monogram" />
      <span className="text-[12px] font-semibold text-[color:var(--foreground)] tracking-tight">
        {title}
      </span>
      {repo ? (
        <>
          <span className="text-[color:var(--muted-foreground)] text-[11px]">
            ·
          </span>
          <span
            className="text-[11px] text-[color:var(--muted-foreground)] font-mono"
            data-testid="titlebar-workspace"
            title={repoPath ?? ''}
          >
            {repo}
          </span>
        </>
      ) : null}
    </div>
  )
}

export function CommandPaletteHint() {
  const { t } = useTranslation()
  return (
    <kbd
      className="hidden sm:inline-flex items-center gap-1 px-2 h-6 text-[10px] font-mono text-[color:var(--muted-foreground)] bg-[color:var(--secondary)] rounded-[var(--radius)] border border-[color:var(--border)]"
      title={t('titlebar.openCommandPalette')}
      data-testid="titlebar-cmdk-hint"
    >
      <Command className="size-3" />K
    </kbd>
  )
}
