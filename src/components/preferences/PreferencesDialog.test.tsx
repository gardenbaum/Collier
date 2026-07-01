import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@/test/test-utils'
import { PreferencesDialog } from './PreferencesDialog'
import { useUIStore } from '@/store/ui-store'

describe('PreferencesDialog', () => {
  beforeEach(() => {
    useUIStore.setState({
      sidebarVisible: true,
      commandPaletteOpen: false,
      preferencesOpen: true,
      lastQuickPaneEntry: null,
    })
  })

  it('renders nothing in the open state area when preferencesOpen is false (dialog handles its own rendering)', () => {
    useUIStore.setState({ preferencesOpen: false })
    render(<PreferencesDialog />)
    // The dialog mounts but Radix hides content via portal; the nav buttons
    // should not be reachable from outside the portal.
    expect(screen.queryByTestId('prefs-nav-general')).toBeNull()
  })

  it('shows the General pane by default when the dialog opens', () => {
    render(<PreferencesDialog />)
    // The header text comes from the i18n key preferences.general
    expect(screen.getByTestId('prefs-nav-general')).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(screen.getByTestId('prefs-nav-appearance')).not.toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(screen.getByTestId('prefs-nav-advanced')).not.toHaveAttribute(
      'aria-current',
      'page'
    )
  })

  it('switches to the Appearance pane when its nav button is clicked', () => {
    render(<PreferencesDialog />)
    fireEvent.click(screen.getByTestId('prefs-nav-appearance'))
    expect(screen.getByTestId('prefs-nav-appearance')).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(screen.getByTestId('prefs-nav-general')).not.toHaveAttribute(
      'aria-current',
      'page'
    )
  })

  it('switches to the Advanced pane when its nav button is clicked', () => {
    render(<PreferencesDialog />)
    fireEvent.click(screen.getByTestId('prefs-nav-advanced'))
    expect(screen.getByTestId('prefs-nav-advanced')).toHaveAttribute(
      'aria-current',
      'page'
    )
    expect(screen.getByTestId('prefs-nav-general')).not.toHaveAttribute(
      'aria-current',
      'page'
    )
  })

  it('switches back to General after cycling through Appearance and Advanced', () => {
    render(<PreferencesDialog />)
    fireEvent.click(screen.getByTestId('prefs-nav-appearance'))
    fireEvent.click(screen.getByTestId('prefs-nav-advanced'))
    fireEvent.click(screen.getByTestId('prefs-nav-general'))
    expect(screen.getByTestId('prefs-nav-general')).toHaveAttribute(
      'aria-current',
      'page'
    )
  })

  it('exposes accessible aria-labels translated via the i18n keys', () => {
    render(<PreferencesDialog />)
    expect(screen.getByTestId('prefs-nav-general')).toHaveAttribute(
      'aria-label'
    )
    expect(screen.getByTestId('prefs-nav-appearance')).toHaveAttribute(
      'aria-label'
    )
    expect(screen.getByTestId('prefs-nav-advanced')).toHaveAttribute(
      'aria-label'
    )
  })
})
