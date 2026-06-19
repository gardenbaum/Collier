import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Settings, Palette, Zap } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { useUIStore } from '@/store/ui-store'
import { GeneralPane } from './panes/GeneralPane'
import { AppearancePane } from './panes/AppearancePane'
import { AdvancedPane } from './panes/AdvancedPane'
import { cn } from '@/lib/utils'

type Pane = 'general' | 'appearance' | 'advanced'

const nav: { id: Pane; icon: typeof Settings; labelKey: string }[] = [
  { id: 'general', icon: Settings, labelKey: 'preferences.general' },
  { id: 'appearance', icon: Palette, labelKey: 'preferences.appearance' },
  { id: 'advanced', icon: Zap, labelKey: 'preferences.advanced' },
]

export function PreferencesDialog() {
  const { t } = useTranslation()
  const [pane, setPane] = useState<Pane>('general')
  const open = useUIStore(s => s.preferencesOpen)
  const setOpen = useUIStore(s => s.setPreferencesOpen)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 md:max-h-[600px] md:max-w-[860px] bg-[color:var(--popover)] backdrop-blur-xl">
        <DialogTitle className="sr-only">{t('preferences.title')}</DialogTitle>
        <DialogDescription className="sr-only">
          {t('preferences.description')}
        </DialogDescription>
        <div className="flex h-[600px]">
          <nav
            aria-label="Preferences navigation"
            className="flex flex-col items-center gap-1 w-14 py-3 border-r border-[color:var(--border)] bg-[color:var(--background)]"
          >
            {nav.map(n => {
              const Icon = n.icon
              const active = pane === n.id
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => setPane(n.id)}
                  aria-current={active ? 'page' : undefined}
                  aria-label={t(n.labelKey)}
                  data-testid={`prefs-nav-${n.id}`}
                  className={cn(
                    'flex items-center justify-center size-10 rounded-[var(--radius)] transition-colors',
                    active
                      ? 'bg-[color:var(--accent)]/20 text-[color:var(--accent)]'
                      : 'text-[color:var(--muted-foreground)] hover:bg-[color:var(--secondary)] hover:text-[color:var(--foreground)]'
                  )}
                >
                  <Icon className="size-4" />
                </button>
              )
            })}
          </nav>
          <main className="flex-1 overflow-y-auto">
            <header className="flex h-10 items-center px-4 border-b border-[color:var(--border)]">
              <h2 className="text-[13px] font-semibold text-[color:var(--foreground)]">
                {t(`preferences.${pane}`)}
              </h2>
            </header>
            <div className="p-4">
              {pane === 'general' && <GeneralPane />}
              {pane === 'appearance' && <AppearancePane />}
              {pane === 'advanced' && <AdvancedPane />}
            </div>
          </main>
        </div>
      </DialogContent>
    </Dialog>
  )
}
