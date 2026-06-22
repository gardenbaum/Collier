import ReactDOM from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { i18n } from './i18n/config'
import './i18n'
import App from './App'
import { queryClient } from './lib/query-client'

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

ReactDOM.createRoot(rootElement).render(
  <QueryClientProvider client={queryClient}>
    <App />
    <ReactQueryDevtools initialIsOpen={false} />
  </QueryClientProvider>
)
