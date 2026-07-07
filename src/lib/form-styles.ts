/**
 * Shared form / input / button CSSProperties — single source of truth
 * for the repeated style blocks that used to live inline in every
 * form-bearing component.
 *
 * Why this module exists
 * ----------------------
 * `bun run jscpd` flagged 11 of the 12 remaining tsx clones on
 * `origin/main` (a2289e7, 2026-07-06) as duplicated
 * `CSSProperties` style blocks. The 5 most-duplicated shapes were:
 *
 *   1. `inputStyle`       — monospace text input     (SettingsPanel, DependencyListView, raw/QuickPane)
 *   2. `textareaStyle`    — multi-line text area     (InlineDescriptionEdit, IssueDetailView)
 *   3. `selectStyle`      — sans dropdown            (DependencyListView)
 *   4. button-style group — sans/sm/medium action    (DependencyListView ×3, SearchView,
 *                                                         InlineDescriptionEdit ×2, IssueDetailView)
 *   5. icon-button        — 24×24 dismiss/remove     (DependencyListView, CycleWarning)
 *
 * Two of the five are *not* byte-for-byte identical (QuickPane's
 * `inputStyle` adds top/bottom borders + lineHeight for the command
 * palette; InlineDescriptionEdit's `submitButtonStyle` highlights the
 * primary action with `borderColor: colors.mono0`). Those overrides
 * stay local — they are semantically distinct — but the shared base
 * lives here.
 *
 * When to extend vs when to inline
 * --------------------------------
 * If you find yourself writing `...buttonStyle, foo: 'bar'` for the
 * third time, that's a hint the override is itself a shared pattern
 * and belongs in this module. One-off tweaks (e.g. `alignSelf:
 * 'flex-start'` on a standalone toggle) should stay in the calling
 * file.
 */
import type { CSSProperties } from 'react'
import { colors, space, type } from './design-tokens'

// --- Form-field base -------------------------------------------------------
// Sans font, sm size, mono9 background, mono3 border, space[2] padding,
// no outline. Used as the seed for inputStyle, selectStyle, textareaStyle.

const fieldBase: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.sm,
  color: colors.mono0,
  backgroundColor: colors.mono9,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.mono3,
  paddingInline: space[2],
  paddingBlock: space[2],
  outline: 'none',
}

/**
 * Monospace text input — for issue IDs, paths, numeric values, and
 * anything else the user is likely to copy/paste or that needs to
 * visually distinguish itself from prose.
 */
export const inputStyle: CSSProperties = {
  ...fieldBase,
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
}

/**
 * Sans dropdown — same baseline as `inputStyle` minus the monospace
 * font, so the rendered text aligns with neighbouring labels.
 */
export const selectStyle: CSSProperties = { ...fieldBase }

/**
 * Block-level multi-line textarea — resizable, full-width, with a
 * sensible minimum height so the input area doesn't collapse when
 * empty. Spread `{...textareaStyle, ...overrides}` for callers that
 * need a different size or width policy.
 */
export const textareaStyle: CSSProperties = {
  ...fieldBase,
  resize: 'vertical',
  width: '100%',
  minHeight: 96,
  boxSizing: 'border-box',
}

// --- Button base -----------------------------------------------------------
// Sans / sm / medium-weight / mono0 text on mono8 / mono3 border /
// paddingInline space[3] / paddingBlock space[2] / cursor pointer.

const buttonBase: CSSProperties = {
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.sm,
  fontWeight: type.fontWeight.medium,
  color: colors.mono0,
  backgroundColor: colors.mono8,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.mono3,
  paddingInline: space[3],
  paddingBlock: space[2],
  cursor: 'pointer',
}

/**
 * Standard form button — the default for "submit", "add", "save"
 * CTAs that don't need a size variant. Pairs with
 * {@link buttonDisabledStyle} for the pending state.
 */
export const buttonStyle: CSSProperties = buttonBase

/**
 * Compact action button — same look as `buttonStyle` but with
 * `paddingBlock: space[1]` so it fits in form action rows where
 * vertical real estate is at a premium (e.g. inline add-dependency
 * form, search submit). Pair with {@link buttonDisabledStyle} for
 * the pending state.
 */
export const actionButtonStyle: CSSProperties = {
  ...buttonBase,
  paddingBlock: space[1],
}

/**
 * Wide button — `paddingInline: space[4]` for primary actions in
 * forms where the longer hit target reads better (e.g. inline issue
 * edit "Save" / "Cancel"). The border stays mono3; callers that want
 * a stronger primary-action highlight can spread
 * `{ ...primaryButtonStyle, borderColor: colors.mono0 }`.
 */
export const primaryButtonStyle: CSSProperties = {
  ...buttonBase,
  paddingInline: space[4],
}

/**
 * Disabled state — pairs with {@link buttonStyle},
 * {@link actionButtonStyle}, or {@link primaryButtonStyle} via
 * spread when the underlying mutation is pending. Uses mono5 text +
 * mono7 border + `not-allowed` cursor to signal non-interactivity.
 */
export const buttonDisabledStyle: CSSProperties = {
  ...buttonBase,
  color: colors.mono5,
  borderColor: colors.mono7,
  cursor: 'not-allowed',
}

/**
 * Icon-only 24×24 button — for dismiss / remove affordances inside
 * list rows and dismissable banners (CycleWarning, DependencyListView
 * remove button). Sits inline-flex so the glyph centres without
 * padding fighting the parent's text-align.
 */
export const iconButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  padding: 0,
  margin: 0,
  fontFamily: type.fontFamily.sans,
  fontSize: type.fontSize.base,
  lineHeight: 1,
  color: colors.mono0,
  backgroundColor: colors.mono8,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: colors.mono3,
  cursor: 'pointer',
}
