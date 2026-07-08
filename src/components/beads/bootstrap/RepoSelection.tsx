import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { commands } from '@/lib/tauri-bindings'
import { colors, space, type as typeTokens } from '@/lib/design-tokens'
import { logger } from '@/lib/logger'

export interface RepoSelectionProps {
  /** Called with the absolute path of the repo the user picked. */
  onSelect: (path: string) => void
}

type CwdStatus = 'unknown' | 'ok' | 'not-a-repo'

/**
 * Bootstrap gate: lets the user pick the active beads repository.
 *
 * Three paths to selection:
 *   1. "Use CWD" link — visible only if `commands.detectBd(cwd)` succeeds.
 *   2. Native folder picker — always available.
 *   3. Recent-repositories list — populated from `AppPreferences.recent_repos`.
 *
 * On every successful selection we call `commands.addRecentRepo(path)`
 * (which dedups + caps at 10) so the next bootstrap reuses it.
 */
export function RepoSelection({ onSelect }: RepoSelectionProps) {
  const { t } = useTranslation()
  const [cwd, setCwd] = useState<string | null>(null)
  const [cwdStatus, setCwdStatus] = useState<CwdStatus>('unknown')
  const [recentRepos, setRecentRepos] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function probe() {
      const cwdResult = await commands.getCurrentDir()
      if (cancelled) return
      if (cwdResult.status !== 'ok') {
        setCwdStatus('not-a-repo')
        return
      }
      const detectedCwd = cwdResult.data
      setCwd(detectedCwd)

      const detectResult = await commands.detectBd(detectedCwd)
      if (cancelled) return
      setCwdStatus(detectResult.status === 'ok' ? 'ok' : 'not-a-repo')

      const prefsResult = await commands.loadPreferences()
      if (cancelled) return
      if (prefsResult.status === 'ok') {
        setRecentRepos(prefsResult.data.recent_repos ?? [])
      }
    }

    probe().catch(error => {
      logger.error('RepoSelection probe failed', { error })
    })
    return () => {
      cancelled = true
    }
  }, [])

  const handleSelect = async (path: string) => {
    if (busy) return
    setBusy(true)
    try {
      const result = await commands.addRecentRepo(path)
      if (result.status === 'error') {
        logger.warn('addRecentRepo failed', { error: result.error })
      }
      onSelect(path)
    } finally {
      setBusy(false)
    }
  }

  const handlePickFolder = async () => {
    if (busy) return
    const picked = await openDialog({
      directory: true,
      multiple: false,
    })
    if (typeof picked === 'string') {
      await handleSelect(picked)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: space[8],
        backgroundColor: colors.mono9,
        color: colors.mono0,
        fontFamily: typeTokens.fontFamily.sans,
        fontSize: typeTokens.fontSize.base,
      }}
    >
      <main
        style={{
          maxWidth: 640,
          width: '100%',
          marginInline: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: space[8],
        }}
      >
        <header>
          <h1
            style={{
              fontSize: typeTokens.fontSize['3xl'],
              fontWeight: typeTokens.fontWeight.bold,
              lineHeight: typeTokens.lineHeight.tight,
              margin: 0,
              color: colors.mono0,
            }}
          >
            {t('beads.bootstrap.selectRepo')}
          </h1>
        </header>

        <section
          style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}
        >
          <button
            type="button"
            onClick={handlePickFolder}
            disabled={busy}
            data-testid="repo-picker-button"
            style={{
              paddingInline: space[4],
              paddingBlock: space[3],
              backgroundColor: colors.mono0,
              color: colors.mono9,
              fontSize: typeTokens.fontSize.base,
              fontWeight: typeTokens.fontWeight.medium,
              border: 'none',
              cursor: busy ? 'wait' : 'pointer',
              textAlign: 'start',
            }}
          >
            {t('beads.bootstrap.selectRepo')}
          </button>

          {cwdStatus === 'ok' && cwd !== null && (
            <button
              type="button"
              onClick={() => void handleSelect(cwd)}
              disabled={busy}
              data-testid="use-cwd-button"
              style={{
                paddingInline: space[4],
                paddingBlock: space[3],
                backgroundColor: 'transparent',
                color: colors.mono0,
                fontSize: typeTokens.fontSize.base,
                fontWeight: typeTokens.fontWeight.regular,
                border: `1px solid ${colors.mono0}`,
                cursor: busy ? 'wait' : 'pointer',
                textAlign: 'start',
                fontFamily: 'monospace',
              }}
            >
              {cwd}
            </button>
          )}
        </section>

        <section
          style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}
        >
          <h2
            style={{
              fontSize: typeTokens.fontSize.lg,
              fontWeight: typeTokens.fontWeight.bold,
              lineHeight: typeTokens.lineHeight.tight,
              margin: 0,
              color: colors.mono0,
            }}
          >
            {t('beads.bootstrap.recentRepos')}
          </h2>

          {recentRepos.length === 0 ? (
            <p
              style={{
                margin: 0,
                fontSize: typeTokens.fontSize.sm,
                color: colors.mono4,
                lineHeight: typeTokens.lineHeight.normal,
              }}
            >
              {t('beads.bootstrap.noRecents')}
            </p>
          ) : (
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: space[1],
              }}
            >
              {recentRepos.map(path => (
                <li key={path}>
                  <button
                    type="button"
                    onClick={() => void handleSelect(path)}
                    disabled={busy}
                    data-testid={`recent-repo-${path}`}
                    style={{
                      width: '100%',
                      paddingInline: space[3],
                      paddingBlock: space[2],
                      backgroundColor: 'transparent',
                      color: colors.mono0,
                      fontSize: typeTokens.fontSize.base,
                      fontFamily: 'monospace',
                      fontWeight: typeTokens.fontWeight.regular,
                      border: 'none',
                      borderBottom: `1px solid ${colors.mono7}`,
                      cursor: busy ? 'wait' : 'pointer',
                      textAlign: 'start',
                    }}
                  >
                    {path}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}
