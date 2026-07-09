/**
 * Tests for the `AppearancePane` component.
 *
 * The pane is small but its real behaviour is the
 * `useTheme().setTheme` / `useSavePreferences().mutate` dance for the
 * theme select, and the `i18n.changeLanguage` / `locale()` /
 * `useSavePreferences().mutate` dance for the language select.
 *
 * That contract is what would silently corrupt a user's theme /
 * language preference if it ever broke - so these tests focus there.
 * The SettingsSection / SettingsField chrome and the Radix Select
 * open/close animation are exercised elsewhere; here we drive the
 * component through the public `onValueChange` surface and assert
 * on the side effects (mocked setTheme, mocked save mutate, mocked
 * i18n.changeLanguage, mocked locale, mocked toast, mocked logger)
 * rather than the underlying primitives.
 *
 * ponytail on Select interactions: @radix-ui/react-select's
 * SelectTrigger fires an `onPointerDown` handler that calls
 * `event.target.hasPointerCapture(event.pointerId)` - jsdom doesn't
 * implement pointer-capture methods, so any pointer-event-driven
 * click through user-event throws "target.hasPointerCapture is not
 * a function". We bypass that path by opening the SelectContent via
 * the keyboard (focus + Enter) which Radix maps to handleOpen
 * WITHOUT going through the pointer-down capture path. The
 * SelectItem rows are then ordinary divs that fireEvent.click
 * handles fine.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@/test/test-utils'
import userEvent from '@testing-library/user-event'
import { AppearancePane } from './AppearancePane'

// ponytail: jsdom does not implement pointer-capture or scroll
// APIs that @radix-ui/react-select touches. Polyfill the methods
// it calls unconditionally - keeping the polyfill scoped to this
// test file so other tests don't inherit behaviour they don't
// need.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => undefined
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {
    // no-op - jsdom has no layout to scroll within.
    return undefined
  }
}

const { mockSetTheme, mockUseTheme } = vi.hoisted(() => ({
  mockSetTheme: vi.fn(),
  mockUseTheme: vi.fn(),
}))

const { mockUsePreferences, mockUseSavePreferences } = vi.hoisted(() => ({
  mockUsePreferences: vi.fn(),
  mockUseSavePreferences: vi.fn(),
}))

const { mockI18nChangeLanguage } = vi.hoisted(() => ({
  mockI18nChangeLanguage: vi.fn(),
}))

const { mockLocale } = vi.hoisted(() => ({
  mockLocale: vi.fn(),
}))

const { mockToast } = vi.hoisted(() => ({
  mockToast: { success: vi.fn(), error: vi.fn() },
}))

const { mockLogger } = vi.hoisted(() => ({
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/hooks/use-theme', () => ({
  useTheme: () => mockUseTheme(),
}))

vi.mock('@/services/preferences', () => ({
  usePreferences: () => mockUsePreferences(),
  useSavePreferences: () => mockUseSavePreferences(),
}))

vi.mock('@tauri-apps/plugin-os', () => ({
  locale: () => mockLocale(),
}))

// react-i18next: keep the real `t` (so SelectItem children render
// the en.json translations like "Dark", "System Default") but
// stub `i18n.changeLanguage` to a controllable mock. We keep the
// real module spread so the rest of react-i18next (Trans, etc.)
// keeps working.
vi.mock('react-i18next', async () => {
  const actual = await vi.importActual('react-i18next')
  const realI18nModule = await vi.importActual('@/i18n/config')
  const realI18n = realI18nModule.default as {
    t: (key: string) => string
    changeLanguage: (lang: string) => Promise<unknown>
  }
  // Patch the shared default i18n instance's changeLanguage to
  // route to our mock - any component reading the real i18n
  // (e.g. via I18nextProvider) hits the same fn.
  ;(
    realI18n as unknown as { changeLanguage: typeof mockI18nChangeLanguage }
  ).changeLanguage = mockI18nChangeLanguage
  const realT = realI18n.t.bind(realI18n)
  return {
    ...actual,
    useTranslation: () => ({
      t: realT,
      i18n: { changeLanguage: mockI18nChangeLanguage },
    }),
  }
})

vi.mock('sonner', () => ({ toast: mockToast }))
vi.mock('@/lib/logger', () => ({ logger: mockLogger }))
// Stable preferences fixture matching `AppPreferences` shape.
const stablePreferences: {
  theme: 'light' | 'dark' | 'system'
  quick_pane_shortcut: string | null
  language: string | null
  recent_repos: string[]
  bd_path: string | null
  default_timeout_secs: number | null
} = {
  theme: 'light',
  quick_pane_shortcut: 'CommandOrControl+Shift+P',
  language: 'en',
  recent_repos: [],
  bd_path: null,
  default_timeout_secs: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseTheme.mockReturnValue({ theme: 'light', setTheme: mockSetTheme })
  mockUsePreferences.mockReturnValue({
    data: stablePreferences,
    isLoading: false,
  })
  mockUseSavePreferences.mockReturnValue({ mutate: vi.fn(), isPending: false })
  mockI18nChangeLanguage.mockResolvedValue(undefined)
  mockLocale.mockResolvedValue('en-US')
})

function setupLoaded(preferences = stablePreferences) {
  const saveMutation = { mutate: vi.fn(), isPending: false }
  mockUsePreferences.mockReturnValue({ data: preferences, isLoading: false })
  mockUseSavePreferences.mockReturnValue(saveMutation)
  const user = userEvent.setup()
  render(<AppearancePane />)
  return { user, saveMutation }
}

function setupPendingSave() {
  const saveMutation = { mutate: vi.fn(), isPending: true }
  mockUsePreferences.mockReturnValue({
    data: stablePreferences,
    isLoading: false,
  })
  mockUseSavePreferences.mockReturnValue(saveMutation)
  const user = userEvent.setup()
  render(<AppearancePane />)
  return { user, saveMutation }
}

function setupLoading() {
  const saveMutation = { mutate: vi.fn(), isPending: false }
  mockUsePreferences.mockReturnValue({ data: undefined, isLoading: true })
  mockUseSavePreferences.mockReturnValue(saveMutation)
  const user = userEvent.setup()
  render(<AppearancePane />)
  return { user, saveMutation }
}

async function openSelectAndPick(
  _user: ReturnType<typeof userEvent.setup>,
  index: number,
  label: string
) {
  const triggers = screen.getAllByRole('combobox')
  const trigger = triggers[index]
  if (!trigger) throw new Error(`No combobox at index ${index}`)
  // Radix SelectTrigger opens on a pointerdown with
  // pointerType="mouse". user-event's pointer chain throws on
  // jsdom (no hasPointerCapture), so we dispatch a real
  // PointerEvent the way testing-library cannot construct via
  // its shorthand (fireEvent.pointerDown sets pointerType on
  // the event init but Radix reads `event.pointerType` from the
  // native PointerEvent interface - we must use the constructor
  // to get the right prototype chain).
  fireEvent(
    trigger,
    new PointerEvent('pointerdown', {
      button: 0,
      pointerType: 'mouse',
      bubbles: true,
      cancelable: true,
    })
  )
  const option = await screen.findByRole('option', { name: label })
  // SelectItem clicks route cleanly via fireEvent.click - no
  // pointer-capture calls in their handler chain.
  fireEvent.click(option)
  // The SelectContent closes after the selection - wait for the
  // option to disappear from the DOM.
  await waitFor(() =>
    expect(
      screen.queryByRole('option', { name: label })
    ).not.toBeInTheDocument()
  )
}

describe('AppearancePane', () => {
  describe('render path', () => {
    it('renders both SettingsSection titles from the i18n catalogue', () => {
      setupLoaded()
      // The SettingsSection titles pull from
      // preferences.appearance.{language,theme} - en.json maps
      // these to "Language" and "Theme" respectively.
      expect(
        screen.getByRole('heading', { name: 'Language', level: 3 })
      ).toBeInTheDocument()
      expect(
        screen.getByRole('heading', { name: 'Theme', level: 3 })
      ).toBeInTheDocument()
    })

    it('renders two SelectTriggers with role="combobox"', () => {
      setupLoaded()
      const triggers = screen.getAllByRole('combobox')
      expect(triggers).toHaveLength(2)
    })

    it('reflects the loaded language preference in the SelectValue (language="fr" => Français)', () => {
      setupLoaded({ ...stablePreferences, language: 'fr' })
      expect(screen.getAllByRole('combobox')[0]).toHaveTextContent('Français')
    })

    it('reflects the loaded theme preference in the SelectValue (theme="dark" => Dark)', () => {
      mockUseTheme.mockReturnValue({ theme: 'dark', setTheme: mockSetTheme })
      setupLoaded({ ...stablePreferences, theme: 'dark' })
      expect(screen.getAllByRole('combobox')[1]).toHaveTextContent('Dark')
    })

    it('falls back to "System Default" when preferences.language is null', () => {
      setupLoaded({ ...stablePreferences, language: null })
      expect(screen.getAllByRole('combobox')[0]).toHaveTextContent(
        'System Default'
      )
    })

    it('disables both SelectTriggers while savePreferences.isPending is true', () => {
      setupPendingSave()
      const triggers = screen.getAllByRole('combobox')
      expect(triggers[0]).toBeDisabled()
      expect(triggers[1]).toBeDisabled()
    })
  })

  describe('theme select', () => {
    it('clicking "dark" calls setTheme("dark") and persists preferences.theme="dark"', async () => {
      const { user, saveMutation } = setupLoaded()
      await openSelectAndPick(user, 1, 'Dark')

      await waitFor(() => expect(mockSetTheme).toHaveBeenCalledWith('dark'))
      expect(saveMutation.mutate).toHaveBeenCalledWith({
        ...stablePreferences,
        theme: 'dark',
      })
      expect(mockToast.error).not.toHaveBeenCalled()
      expect(mockLogger.error).not.toHaveBeenCalled()
    })

    it('clicking "system" calls setTheme("system") and persists preferences.theme="system"', async () => {
      const { user, saveMutation } = setupLoaded()
      await openSelectAndPick(user, 1, 'System')

      await waitFor(() => expect(mockSetTheme).toHaveBeenCalledWith('system'))
      expect(saveMutation.mutate).toHaveBeenCalledWith({
        ...stablePreferences,
        theme: 'system',
      })
    })

    it('clicking "light" merges the new theme into preferences (regression: ...preferences, theme: value)', async () => {
      mockUseTheme.mockReturnValue({ theme: 'dark', setTheme: mockSetTheme })
      const { user, saveMutation } = setupLoaded({
        ...stablePreferences,
        theme: 'dark',
      })
      await openSelectAndPick(user, 1, 'Light')

      await waitFor(() => expect(mockSetTheme).toHaveBeenCalledWith('light'))
      expect(saveMutation.mutate).toHaveBeenCalledWith({
        ...stablePreferences,
        theme: 'light',
      })
    })

    it('skips savePreferences when preferences have not loaded (branch coverage)', async () => {
      const { user, saveMutation } = setupLoading()

      await openSelectAndPick(user, 1, 'Dark')

      await waitFor(() => expect(mockSetTheme).toHaveBeenCalledWith('dark'))
      expect(saveMutation.mutate).not.toHaveBeenCalled()
    })
  })

  describe('language select - explicit language', () => {
    it('clicking "Français" calls i18n.changeLanguage("fr") and persists preferences.language="fr"', async () => {
      const { user, saveMutation } = setupLoaded({
        ...stablePreferences,
        language: 'en',
      })
      await openSelectAndPick(user, 0, 'Français')

      await waitFor(() =>
        expect(mockI18nChangeLanguage).toHaveBeenCalledWith('fr')
      )
      await waitFor(() =>
        expect(saveMutation.mutate).toHaveBeenCalledWith({
          ...stablePreferences,
          language: 'fr',
        })
      )
      expect(mockToast.error).not.toHaveBeenCalled()
      expect(mockLogger.error).not.toHaveBeenCalled()
    })

    it('clicking "English" calls i18n.changeLanguage("en") and persists preferences.language="en"', async () => {
      const { user, saveMutation } = setupLoaded({
        ...stablePreferences,
        language: 'fr',
      })
      await openSelectAndPick(user, 0, 'English')

      await waitFor(() =>
        expect(mockI18nChangeLanguage).toHaveBeenCalledWith('en')
      )
      expect(saveMutation.mutate).toHaveBeenCalledWith({
        ...stablePreferences,
        language: 'en',
      })
    })

    it('skips savePreferences when preferences have not loaded (branch coverage)', async () => {
      const { user, saveMutation } = setupLoading()

      await openSelectAndPick(user, 0, 'Français')

      await waitFor(() =>
        expect(mockI18nChangeLanguage).toHaveBeenCalledWith('fr')
      )
      expect(saveMutation.mutate).not.toHaveBeenCalled()
    })
  })

  describe('language select - system option (locale detection)', () => {
    it('locale() returns "fr-FR" => changeLanguage("fr") + persist language=null', async () => {
      const { user, saveMutation } = setupLoaded()
      mockLocale.mockResolvedValue('fr-FR')

      await openSelectAndPick(user, 0, 'System Default')

      await waitFor(() => expect(mockLocale).toHaveBeenCalled())
      await waitFor(() =>
        expect(mockI18nChangeLanguage).toHaveBeenCalledWith('fr')
      )
      // Persistence uses language=null to flag the automatic
      // detection so the on-disk prefs don't pin a code.
      expect(saveMutation.mutate).toHaveBeenCalledWith({
        ...stablePreferences,
        language: null,
      })
    })

    it('locale() returns an unknown code "zz-ZZ" => fallback to changeLanguage("en")', async () => {
      const { user, saveMutation } = setupLoaded()
      mockLocale.mockResolvedValue('zz-ZZ')

      await openSelectAndPick(user, 0, 'System Default')

      await waitFor(() => expect(mockLocale).toHaveBeenCalled())
      await waitFor(() =>
        expect(mockI18nChangeLanguage).toHaveBeenCalledWith('en')
      )
      expect(saveMutation.mutate).toHaveBeenCalledWith({
        ...stablePreferences,
        language: null,
      })
    })

    it('locale() returns null => fallback to changeLanguage("en")', async () => {
      const { user, saveMutation } = setupLoaded()
      mockLocale.mockResolvedValue(null)

      await openSelectAndPick(user, 0, 'System Default')

      await waitFor(() => expect(mockLocale).toHaveBeenCalled())
      await waitFor(() =>
        expect(mockI18nChangeLanguage).toHaveBeenCalledWith('en')
      )
      expect(saveMutation.mutate).toHaveBeenCalledWith({
        ...stablePreferences,
        language: null,
      })
    })

    it('locale() returns single-segment code "ar" => changeLanguage("ar")', async () => {
      const { user, saveMutation } = setupLoaded()
      mockLocale.mockResolvedValue('ar')

      await openSelectAndPick(user, 0, 'System Default')

      await waitFor(() => expect(mockLocale).toHaveBeenCalled())
      await waitFor(() =>
        expect(mockI18nChangeLanguage).toHaveBeenCalledWith('ar')
      )
      expect(saveMutation.mutate).toHaveBeenCalledWith({
        ...stablePreferences,
        language: null,
      })
    })
  })

  describe('language select - error path', () => {
    it('i18n.changeLanguage rejects => logger.error + toast.error, save NOT called', async () => {
      const ipcError = new Error('i18n backend offline')
      mockI18nChangeLanguage.mockRejectedValueOnce(ipcError)
      const { user, saveMutation } = setupLoaded()

      await openSelectAndPick(user, 0, 'Français')

      await waitFor(() =>
        expect(mockI18nChangeLanguage).toHaveBeenCalledWith('fr')
      )
      await waitFor(() =>
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Failed to change language',
          expect.objectContaining({ error: ipcError })
        )
      )
      expect(mockToast.error).toHaveBeenCalledWith('Something went wrong')
      // No preferences were persisted when the language change
      // blew up - on-disk prefs would otherwise say "fr" while
      // the UI is still on English.
      expect(saveMutation.mutate).not.toHaveBeenCalled()
    })

    it('locale() rejects in the system branch => logger.error + toast.error, save NOT called', async () => {
      const localeError = new Error('tauri plugin-os unavailable')
      mockLocale.mockRejectedValueOnce(localeError)
      const { user, saveMutation } = setupLoaded()

      await openSelectAndPick(user, 0, 'System Default')

      await waitFor(() => expect(mockLocale).toHaveBeenCalled())
      await waitFor(() =>
        expect(mockLogger.error).toHaveBeenCalledWith(
          'Failed to change language',
          expect.objectContaining({ error: localeError })
        )
      )
      expect(mockToast.error).toHaveBeenCalledWith('Something went wrong')
      expect(mockI18nChangeLanguage).not.toHaveBeenCalled()
      expect(saveMutation.mutate).not.toHaveBeenCalled()
    })
  })
})
