import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { formatShortcutForDisplay, keyEventToShortcut } from './shortcut-format'

interface ShortcutPickerProps {
  value: string | null
  defaultValue: string
  onChange: (shortcut: string | null) => void
  disabled?: boolean
  className?: string
}

export function ShortcutPicker({
  value,
  defaultValue,
  onChange,
  disabled = false,
  className,
}: ShortcutPickerProps) {
  const { t } = useTranslation()
  const [isCapturing, setIsCapturing] = useState(false)
  const [pendingShortcut, setPendingShortcut] = useState<string | null>(null)
  const inputRef = useRef<HTMLDivElement>(null)

  const displayValue = value ?? defaultValue
  const isDefault = value === null

  // Handle keyboard events when capturing
  useEffect(() => {
    if (!isCapturing) return

    const inputElement = inputRef.current

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      // Escape cancels capture
      if (e.key === 'Escape') {
        setPendingShortcut(null)
        setIsCapturing(false)
        return
      }

      const shortcut = keyEventToShortcut(e)
      if (shortcut) {
        setPendingShortcut(shortcut)
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()

      // If we have a pending shortcut and key is released, confirm it
      if (pendingShortcut) {
        // Compare to default to determine if we should save null or the shortcut
        const valueToSave =
          pendingShortcut === defaultValue ? null : pendingShortcut
        onChange(valueToSave)
        setPendingShortcut(null)
        setIsCapturing(false)
      }
    }

    const handleBlur = () => {
      setPendingShortcut(null)
      setIsCapturing(false)
    }

    window.addEventListener('keydown', handleKeyDown, true)
    window.addEventListener('keyup', handleKeyUp, true)
    inputElement?.addEventListener('blur', handleBlur)

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
      window.removeEventListener('keyup', handleKeyUp, true)
      inputElement?.removeEventListener('blur', handleBlur)
    }
  }, [isCapturing, pendingShortcut, defaultValue, onChange])

  const handleClick = () => {
    if (disabled) return
    setIsCapturing(true)
    inputRef.current?.focus()
  }

  const handleReset = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (disabled) return
    onChange(null)
  }

  return (
    <div className="flex items-center gap-2">
      <div
        ref={inputRef}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={handleClick}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleClick()
          }
        }}
        className={cn(
          'border-input h-9 min-w-[120px] rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none select-none',
          'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
          'flex items-center justify-center font-mono',
          isCapturing && 'border-ring ring-ring/50 ring-[3px] bg-muted/50',
          disabled && 'pointer-events-none cursor-not-allowed opacity-50',
          className
        )}
      >
        {isCapturing ? (
          <span className="text-muted-foreground animate-pulse">
            {pendingShortcut
              ? formatShortcutForDisplay(pendingShortcut)
              : 'Press shortcut...'}
          </span>
        ) : (
          <span className={isDefault ? 'text-muted-foreground' : ''}>
            {formatShortcutForDisplay(displayValue)}
          </span>
        )}
      </div>

      {!isDefault && !disabled && (
        <button
          type="button"
          onClick={handleReset}
          className="text-muted-foreground hover:text-foreground text-xs underline"
        >
          {t('common.reset')}
        </button>
      )}
    </div>
  )
}
