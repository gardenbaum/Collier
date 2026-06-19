import { useEffect } from 'react'
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable'
import { TitleBar } from '@/components/titlebar/TitleBar'
import { Sidebar } from '@/components/layout/Sidebar'
import { MainWindowContent } from '@/components/layout/MainWindowContent'
import { CommandPalette } from '@/components/command-palette/CommandPalette'
import { PreferencesDialog } from '@/components/preferences/PreferencesDialog'
import { Toaster } from 'sonner'
import { useTheme } from '@/hooks/use-theme'
import { useUIStore } from '@/store/ui-store'
import { useWorkspaceStore } from '@/store/workspace-store'
import { useMainWindowEventListeners } from '@/hooks/useMainWindowEventListeners'
import { commands } from '@/lib/tauri-bindings'
import { logger } from '@/lib/logger'
import { cn } from '@/lib/utils'

/**
 * Layout sizing configuration for the 2-panel app shell.
 * All values are percentages of total width. Sidebar default + main
 * default must sum to 100.
 */
const LAYOUT = {
  sidebar: { default: 20, min: 17, max: 30 },
  main: { min: 40 },
} as const

const MAIN_DEFAULT = 100 - LAYOUT.sidebar.default

export function MainWindow() {
  const { theme } = useTheme()
  const sidebarVisible = useUIStore(s => s.sidebarVisible)
  const repoPath = useWorkspaceStore(s => s.repoPath)
  useMainWindowEventListeners()
  useEffect(() => {
    if (repoPath === null) return
    commands
      .attachWatchRepo(repoPath)
      .catch(err => logger.warn('Failed to attach watcher', { err }))
  }, [repoPath])

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden rounded-[var(--app-corner-radius)] bg-[color:var(--background)]">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal">
          <ResizablePanel
            defaultSize={LAYOUT.sidebar.default}
            minSize={LAYOUT.sidebar.min}
            maxSize={LAYOUT.sidebar.max}
            className={cn(!sidebarVisible && 'hidden')}
          >
            <Sidebar />
          </ResizablePanel>
          <ResizableHandle className={cn(!sidebarVisible && 'hidden')} />
          <ResizablePanel defaultSize={MAIN_DEFAULT} minSize={LAYOUT.main.min}>
            <MainWindowContent />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
      <CommandPalette />
      <PreferencesDialog />
      <Toaster
        position="bottom-right"
        theme={
          theme === 'dark' ? 'dark' : theme === 'light' ? 'light' : 'system'
        }
        className="toaster group"
        toastOptions={{
          classNames: {
            toast:
              'group toast group-[.toaster]:bg-[color:var(--popover)] group-[.toaster]:backdrop-blur-xl group-[.toaster]:text-[color:var(--popover-foreground)] group-[.toaster]:border group-[.toaster]:border-[color:var(--border)] group-[.toaster]:shadow-lg',
            description: 'group-[.toast]:text-[color:var(--muted-foreground)]',
            actionButton:
              'group-[.toast]:bg-[color:var(--primary)] group-[.toast]:text-[color:var(--primary-foreground)]',
            cancelButton:
              'group-[.toast]:bg-[color:var(--muted)] group-[.toast]:text-[color:var(--muted-foreground)]',
          },
        }}
      />
    </div>
  )
}
