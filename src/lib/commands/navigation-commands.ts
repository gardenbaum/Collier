import { Search, Sidebar, Settings } from 'lucide-react'
import { useUIStore } from '@/store/ui-store'
import { useWorkspaceStore } from '@/store/workspace-store'
import { focusSearchInput } from '@/hooks/use-keyboard-navigation'
import type { AppCommand } from './types'

export const navigationCommands: AppCommand[] = [
  {
    id: 'show-sidebar',
    labelKey: 'commands.showLeftSidebar.label',
    descriptionKey: 'commands.showLeftSidebar.description',
    icon: Sidebar,
    group: 'navigation',
    shortcut: '⌘+1',
    keywords: ['sidebar', 'panel', 'show'],

    execute: () => {
      useUIStore.getState().setSidebarVisible(true)
    },

    isAvailable: () => !useUIStore.getState().sidebarVisible,
  },

  {
    id: 'hide-sidebar',
    labelKey: 'commands.hideLeftSidebar.label',
    descriptionKey: 'commands.hideLeftSidebar.description',
    icon: Sidebar,
    group: 'navigation',
    shortcut: '⌘+1',
    keywords: ['sidebar', 'panel', 'hide'],

    execute: () => {
      useUIStore.getState().setSidebarVisible(false)
    },

    isAvailable: () => useUIStore.getState().sidebarVisible,
  },

  {
    id: 'open-preferences',
    labelKey: 'commands.openPreferences.label',
    descriptionKey: 'commands.openPreferences.description',
    icon: Settings,
    group: 'settings',
    shortcut: '⌘+,',
    keywords: ['preferences', 'settings', 'config', 'options'],

    execute: context => {
      context.openPreferences()
    },
  },

  {
    // M5 keyboard navigation: command-palette equivalent of the
    // `/` shortcut. Same code path (switch view + dispatch focus
    // event) so the behaviour is identical whether the user types
    // `/` on the body or runs the command from the palette.
    id: 'go-to-search',
    labelKey: 'commands.goToSearch.label',
    descriptionKey: 'commands.goToSearch.description',
    icon: Search,
    group: 'navigation',
    shortcut: '/',
    keywords: ['search', 'find', 'query', 'lookup'],

    execute: () => {
      useWorkspaceStore.getState().setActiveView('search')
      focusSearchInput()
    },
  },
]
