import { render, screen } from '@testing-library/react'
import type { ToasterProps } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSonner, mockUseTheme } = vi.hoisted(() => ({
  mockSonner: vi.fn((props: ToasterProps) => (
    <div
      className={props.className}
      data-testid="mock-sonner"
      data-theme={props.theme}
      style={props.style}
    />
  )),
  mockUseTheme: vi.fn(),
}))

vi.mock('sonner', () => ({ Toaster: mockSonner }))
vi.mock('@/hooks/use-theme', () => ({ useTheme: mockUseTheme }))

import { Toaster } from './sonner'

function getLastSonnerProps(): ToasterProps {
  const call = mockSonner.mock.calls.at(-1)
  if (call === undefined) throw new Error('Sonner Toaster was not rendered')
  return call[0]
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseTheme.mockReturnValue({})
})

describe('Toaster', () => {
  it('defaults the Sonner theme to system when useTheme has no theme', () => {
    render(<Toaster />)

    expect(mockUseTheme).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('mock-sonner')).toHaveAttribute(
      'data-theme',
      'system'
    )
    expect(getLastSonnerProps().theme).toBe('system')
  })

  it('uses the current theme returned by useTheme', () => {
    mockUseTheme.mockReturnValue({ theme: 'dark' })

    render(<Toaster />)

    expect(getLastSonnerProps().theme).toBe('dark')
  })

  it('allows an explicit theme prop to override the useTheme value', () => {
    mockUseTheme.mockReturnValue({ theme: 'dark' })

    render(<Toaster theme="light" />)

    expect(getLastSonnerProps().theme).toBe('light')
  })

  it('applies the toaster group className to the underlying Sonner', () => {
    render(<Toaster />)

    expect(screen.getByTestId('mock-sonner')).toHaveClass('toaster', 'group')
    expect(getLastSonnerProps().className).toBe('toaster group')
  })

  it('sets the normal color CSS variables on the inline style', () => {
    render(<Toaster />)

    const element = screen.getByTestId('mock-sonner')
    expect(element.style.getPropertyValue('--normal-bg')).toBe('var(--popover)')
    expect(element.style.getPropertyValue('--normal-text')).toBe(
      'var(--popover-foreground)'
    )
    expect(element.style.getPropertyValue('--normal-border')).toBe(
      'var(--border)'
    )
    expect(getLastSonnerProps().style).toEqual({
      '--normal-bg': 'var(--popover)',
      '--normal-text': 'var(--popover-foreground)',
      '--normal-border': 'var(--border)',
    })
  })

  it('forwards Sonner props to the underlying component', () => {
    render(
      <Toaster
        closeButton
        duration={4_000}
        expand
        id="app-notifications"
        position="top-right"
        richColors
        visibleToasts={7}
      />
    )

    expect(getLastSonnerProps()).toEqual(
      expect.objectContaining({
        closeButton: true,
        duration: 4_000,
        expand: true,
        id: 'app-notifications',
        position: 'top-right',
        richColors: true,
        visibleToasts: 7,
      })
    )
  })
})
