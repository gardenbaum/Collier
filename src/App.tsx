/**
 * App — the root component.
 *
 * Bootstrap flow (in order):
 *   1. <BdNotInPath />     — blocking modal when `bd` is missing
 *   2. <RepoSelection />   — pick a repo; sets `repoPath` in the
 *                             workspace store (persisted to localStorage)
 *   3. <MainWindow />      — the full Beads UI (titlebar / left
 *                             sidebar / center content / right sidebar
 *                             + command palette / preferences / toaster)
 *
 * The watcher IPC is fired from MainWindow so the React-side
 * `useBeadsInvalidation` filter (which requires events to carry the
 * active `repo_path`) actually matches. The auto-updater dialog
 * fires 5s after mount; the menu-driven "Check for updates" path
 * uses the same `runUpdateCheck` function with `surfaceErrors: true`.
 */
import { useEffect, useRef } from 'react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import {
  ask,
  message,
  type MessageDialogOptions,
} from '@tauri-apps/plugin-dialog'
import { initializeCommandSystem } from './lib/commands'
import { buildAppMenu, setupMenuLanguageListener } from './lib/menu'
import { initializeLanguage } from './i18n/language-init'
import { logger } from './lib/logger'
import { cleanupOldFiles } from './lib/recovery'
import { commands } from './lib/tauri-bindings'
import './App.css'
import { MainWindow } from './components/layout/MainWindow'
import { ThemeProvider } from './components/ThemeProvider'
import { ErrorBoundary } from './components/ErrorBoundary'
import { BdNotInPath, RepoSelection } from './components/beads/bootstrap'
import { useSquareCornersEffect } from './hooks/useSquareCornersEffect'
import { useWorkspaceStore } from './store/workspace-store'
import { attachToWorkspaceStore as attachFilterToWorkspace } from './store/issue-filter-store'
import { attachToWorkspaceStore as attachScrollToWorkspace } from './store/scroll-position-store'

/**
 * Run the Tauri updater flow. Lifted to a module-level function so
 * it can be called both by the 5s startup one-shot and by the
 * `menu.checkForUpdates` menu item.
 *
 * `surfaceErrors: true` makes a failed `check()` surface a
 * user-visible dialog (the menu-driven retry should not go
 * silent); the startup path passes `false` because a network
 * blip on cold launch shouldn't bother the user.
 */
async function runUpdateCheck(
  t: TFunction,
  surfaceErrors: boolean
): Promise<void> {
  let update
  try {
    update = await check()
  } catch (checkError) {
    logger.error(`Update check failed: ${String(checkError)}`)
    if (surfaceErrors) {
      await message(
        t(
          'updater.checkErrorDescription',
          'Could not reach the update server.\n\n{{error}}',
          { error: String(checkError) }
        ),
        {
          title: t('updater.checkErrorTitle', 'Update check failed'),
          kind: 'error',
        } satisfies MessageDialogOptions
      )
    }
    return
  }
  if (!update) {
    if (surfaceErrors) {
      await message(
        t('updater.upToDate', 'You are running the latest version.'),
        {
          title: t('updater.upToDateTitle', 'No updates available'),
          kind: 'info',
        }
      )
    }
    return
  }
  logger.info(`Update available: ${update.version}`)

  const shouldUpdate = await ask(
    t(
      'updater.prompt',
      'Update available: {{version}}\n\nWould you like to install this update now?',
      { version: update.version }
    ),
    {
      title: t('updater.promptTitle', 'Update available'),
      kind: 'info',
      okLabel: t('updater.install', 'Install'),
      cancelLabel: t('updater.later', 'Later'),
    }
  )
  if (!shouldUpdate) return

  try {
    await update.downloadAndInstall(event => {
      switch (event.event) {
        case 'Started':
          logger.info(`Downloading ${event.data.contentLength} bytes`)
          break
        case 'Progress':
          logger.info(`Downloaded: ${event.data.chunkLength} bytes`)
          break
        case 'Finished':
          logger.info('Download complete, installing...')
          break
      }
    })

    const shouldRestart = await ask(
      t(
        'updater.restartPrompt',
        'Update completed successfully!\n\nWould you like to restart the app now to use the new version?'
      ),
      {
        title: t('updater.restartTitle', 'Restart required'),
        kind: 'info',
        okLabel: t('updater.restart', 'Restart'),
        cancelLabel: t('updater.later', 'Later'),
      }
    )
    if (shouldRestart) {
      await relaunch()
    }
  } catch (updateError) {
    logger.error(`Update installation failed: ${String(updateError)}`)
    await message(
      t(
        'updater.errorDescription',
        'Update failed: There was a problem with the automatic download.\n\n{{error}}',
        { error: String(updateError) }
      ),
      {
        title: t('updater.errorTitle', 'Update failed'),
        kind: 'error',
      } satisfies MessageDialogOptions
    )
  }
}

function App() {
  useSquareCornersEffect()
  const { t } = useTranslation()
  const repoPath = useWorkspaceStore(s => s.repoPath)
  const setRepoPath = useWorkspaceStore(s => s.setRepoPath)

  // M4: wire the per-workspace stores (filter + scroll position)
  // to the workspace-store so a `switchWorkspace` / `setRepoPath`
  // call swaps the active filter / scroll offset to the new repo's
  // saved values. Idempotent — both `attach*` helpers replace any
  // previous subscription. Runs on mount only; we don't tear down
  // for the session lifetime.
  useEffect(() => {
    const u1 = attachFilterToWorkspace(useWorkspaceStore)
    const u2 = attachScrollToWorkspace(useWorkspaceStore)
    return () => {
      u1()
      u2()
    }
  }, [])

  // The startup effect reads `t` through a ref so the effect body
  // stays cheap to re-run if we ever need to (e.g. on language
  // change). The ref is updated in a tiny follow-up effect so the
  // React Compiler's "no ref writes during render" rule stays happy.
  const tRef = useRef(t)
  useEffect(() => {
    tRef.current = t
  }, [t])

  useEffect(() => {
    logger.info('🚀 Frontend application starting up')
    initializeCommandSystem()
    logger.debug('Command system initialized')

    const initLanguageAndMenu = async () => {
      try {
        const result = await commands.loadPreferences()
        const savedLanguage =
          result.status === 'ok' ? result.data.language : null
        await initializeLanguage(savedLanguage)
        await buildAppMenu()
        logger.debug('Application menu built')
        setupMenuLanguageListener()
      } catch (error) {
        logger.warn('Failed to initialize language or menu', { error })
      }
    }

    initLanguageAndMenu()

    cleanupOldFiles().catch(error => {
      logger.warn('Failed to cleanup old recovery files', { error })
    })

    logger.info('App environment', {
      isDev: import.meta.env.DEV,
      mode: import.meta.env.MODE,
    })

    // Auto-updater: probe the update server 5s after launch. The
    // timer is cleared on unmount; the App component lives for the
    // whole session, but the cleanup keeps Strict Mode and HMR from
    // stacking two concurrent checks.
    const updateTimer = setTimeout(() => {
      void runUpdateCheck(tRef.current, false)
    }, 5000)
    return () => clearTimeout(updateTimer)
  }, [])

  // Manual "Check for updates" trigger from the application menu.
  // The menu wiring is in `src/lib/menu.ts`; clicking the entry
  // dispatches a custom DOM event we listen for here. The event-based
  // bridge keeps the menu module free of React / i18n state.
  useEffect(() => {
    const handler = () => {
      void runUpdateCheck(t, true)
    }
    window.addEventListener('collier:menu-check-for-updates', handler)
    return () =>
      window.removeEventListener('collier:menu-check-for-updates', handler)
  }, [t])

  return (
    <ErrorBoundary>
      <ThemeProvider>
        {/*
          Bootstrap gate order:
            1. BdNotInPath — blocking modal; only stops the user when `bd` is
               actually missing (returns null from checkBdVersionCmd on success).
            2. RepoSelection — pick a repo. Stores the result in the workspace
               store so a restart lands the user back in the same workspace.
            3. MainWindow — the main UI.
        */}
        <BdNotInPath />
        {repoPath === null ? (
          <RepoSelection onSelect={setRepoPath} />
        ) : (
          <MainWindow />
        )}
      </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App
