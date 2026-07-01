/**
 * Welcome / empty state for the beads namespace.
 *
 * Rendered by the parent (MainWindowContent, Wave 8) when Beads is
 * initialized AND the issue list is empty. The single CTA invokes
 * `onCreate` to start the create-issue flow (T21).
 *
 * Styling: Bauhaus + Swiss — hard edges, design tokens only.
 * Button is intentionally a neutral `colors.mono0` solid, NOT the
 * accent (`#c2410c` is reserved for destructive actions and the P0
 * priority badge per the design system hard rule).
 */
import { useState } from 'react'
import { colors, space, type } from '@/lib/design-tokens'

export interface WelcomeProps {
  /** Called when the user clicks the "Create issue" button. */
  onCreate: () => void
}

export function Welcome({ onCreate }: WelcomeProps) {
  // ponytail: hover state is a single local bool, no need for refs or
  // css-in-js — the cost of a re-render on mouseenter is one styled
  // <button>, way below the noise floor.
  const [hovered, setHovered] = useState(false)

  return (
    <div
      data-testid="welcome"
      className="flex h-full w-full flex-col items-center justify-center"
      style={{
        padding: space[6],
        backgroundColor: colors.mono9,
        color: colors.mono0,
      }}
    >
      <div
        className="flex flex-col"
        style={{
          width: '100%',
          maxWidth: 800,
          gap: space[8],
        }}
      >
        <h1
          style={{
            fontFamily: type.fontFamily.sans,
            fontWeight: type.fontWeight.bold,
            fontSize: type.fontSize['3xl'],
            lineHeight: type.lineHeight.tight,
            color: colors.mono0,
            margin: 0,
          }}
        >
          Welcome to Collier
        </h1>
        <p
          style={{
            fontFamily: type.fontFamily.sans,
            fontWeight: type.fontWeight.regular,
            fontSize: type.fontSize.lg,
            lineHeight: type.lineHeight.normal,
            color: colors.mono4,
            margin: 0,
          }}
        >
          Beads is initialized. Create your first issue to get started.
        </p>
        <div>
          <button
            type="button"
            data-testid="create-issue"
            onClick={onCreate}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
              fontFamily: type.fontFamily.sans,
              fontWeight: type.fontWeight.medium,
              fontSize: type.fontSize.base,
              lineHeight: type.lineHeight.tight,
              padding: `${space[3]}px ${space[6]}px`,
              backgroundColor: hovered ? colors.mono1 : colors.mono0,
              color: colors.mono9,
              border: 'none',
              borderRadius: 0,
              cursor: 'pointer',
            }}
          >
            Create issue
          </button>
        </div>
      </div>
    </div>
  )
}
