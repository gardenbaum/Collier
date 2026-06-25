import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { i18n } from './i18n/config'
import './i18n'
import App from './App'
import { queryClient } from './lib/query-client'
import { installQueryClient } from './store/workspace-store'

// Set the `<html lang>` synchronously from the saved preference
// (or the i18n default) so screen readers announce the correct
// language on the first frame. Without this, `index.html`'s
// hardcoded `lang="en"` leaks through for the first paint, then
// the i18n `languageChanged` handler in `i18n/config.ts` updates
// the attribute ~1 frame later. The duplication is intentional:
// we can't trust the i18n event for the boot frame.
const rtlLanguages = ['ar', 'he', 'fa', 'ur']
const initialLng = i18n.language || 'en'
document.documentElement.lang = initialLng
document.documentElement.dir = rtlLanguages.includes(initialLng) ? 'rtl' : 'ltr'

const rootElement = document.getElementById('root')
if (rootElement === null) {
  throw new Error(
    'Collier could not mount: #root element is missing from index.html'
  )
}

// Wire the singleton queryClient into the workspace store so
// `switchWorkspace` can drop the old workspace's `['beads']` query
// cache. Must happen before `App` mounts (so the bootstrap path's
// `setRepoPath` calls don't race the install); we do it here at the
// QueryClientProvider boundary.
installQueryClient(queryClient)

// ponytail: E2E hook — expose the queryClient on `window` so the
// wdio specs can read cache state directly via `page-context`
// JavaScript instead of polling DOM attributes. The DOM is a
// *windowed* projection of the cache (`@tanstack/react-virtual`
// only mounts ~15 rows at a time), so polling the DOM for a row
// the virtualizer has unmounted races with the test's `waitUntil`
// loop and times out at 1500 ms even when the watcher already
// patched the cache. Reading from the cache is race-free: the
// queryClient holds every cached issue regardless of what's
// mounted, and the watcher patches it synchronously on the file
// event. The harness gates on `import.meta.env.VITE_E2E === '1'`
// so production builds don't ship a debugging handle. The flag
// is set by the E2E CI workflow via the build-time Vite env (see
// `.github/workflows/ci.yml` — `E2E_TAURI_EXECUTABLE` is the
// adjacent env var; the Vite flag is independent).
if (import.meta.env.VITE_E2E === '1') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).__collierQueryClient__ = queryClient
}

ReactDOM.createRoot(rootElement).render(
  <QueryClientProvider client={queryClient}>
    <App />
    <ReactQueryDevtools initialIsOpen={false} />
  </QueryClientProvider>
)
