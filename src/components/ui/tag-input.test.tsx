import { createRef, useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { TagInput, type Tag, type TagInputProps } from './tag-input'

/**
 * These tests cover the TagInput primitive declared in
 * src/components/ui/tag-input.tsx (currently 0% coverage).
 *
 * TagInput is a React.forwardRef wrapper around a div containing Badge
 * tags plus an editable text input. It owns its own draft input value
 * (inputValue) but treats the `tags` array as externally-controlled —
 * mutations are reported back through `onTagsChange` so the parent can
 * update its state. The component exposes several behavioural branches
 * (Enter to add, Backspace to remove, Escape to clear, X-button remove,
 * maxTags ceiling, allowDuplicates override, disabled mode, container-
 * click focus) and forwards arbitrary div props onto its outer wrapper.
 *
 * Because the component is externally-controlled for the tag list, the
 * tests below drive it through a stateful `ControlledTagInput` harness
 * that mirrors the contract used by real consumers: pass in `tags`,
 * capture `onTagsChange`, and on the next render supply the updated
 * list. This guarantees every branch re-runs against the same state
 * the user would observe. Mirrors the Badge / Sonner / DatePicker
 * test patterns established in PRs #100 / #123 / #124.
 */

interface ControlledTagInputProps extends Omit<
  TagInputProps,
  'tags' | 'onTagsChange'
> {
  initialTags?: Tag[]
}

function ControlledTagInput({
  initialTags = [],
  ...props
}: ControlledTagInputProps) {
  const [tags, setTags] = useState<Tag[]>(initialTags)
  return (
    <TagInput
      data-testid="tag-input"
      tags={tags}
      onTagsChange={setTags}
      {...props}
    />
  )
}

const getContainer = (): HTMLElement =>
  screen.getByTestId('tag-input') as HTMLElement

const getInput = (): HTMLInputElement =>
  getContainer().querySelector('input') as HTMLInputElement

describe('TagInput', () => {
  describe('rendering', () => {
    it('renders the wrapper div with the base cn() classes and no data-slot', () => {
      render(<ControlledTagInput />)

      const container = getContainer()
      expect(container.tagName).toBe('DIV')

      // Representative base classes that the cn() call always applies.
      expect(container).toHaveClass('flex')
      expect(container).toHaveClass('min-h-9')
      expect(container).toHaveClass('w-full')
      expect(container).toHaveClass('rounded-[var(--radius)]')
      expect(container).toHaveClass('border')
      expect(container).toHaveClass('bg-transparent')
      expect(container).toHaveClass('px-3')
      expect(container).toHaveClass('py-1')
      expect(container).toHaveClass('text-base')
      expect(container).toHaveClass('shadow-xs')
      expect(container).toHaveClass('md:text-sm')
      expect(container).toHaveClass('focus-within:ring-2')

      // The component does NOT add a data-slot of its own; it spreads
      // {...props} onto the outer div instead, so the test id is the
      // hook we use to locate the wrapper.
      expect(container).not.toHaveAttribute('data-slot')

      // Disabled styling must NOT be present by default.
      expect(container).not.toHaveClass('cursor-not-allowed')
      expect(container).not.toHaveClass('opacity-50')
    })

    it('renders the default placeholder text only when no tags are present', () => {
      render(<ControlledTagInput placeholder="Add a tag..." />)

      const input = getInput()
      expect(input).toHaveAttribute('placeholder', 'Add a tag...')

      // The Badge renders text content + an X button for each tag.
      expect(
        screen.queryByRole('button', { name: /Remove .* tag/ })
      ).not.toBeInTheDocument()
    })

    it('renders a custom placeholder when no tags are present', () => {
      render(<ControlledTagInput placeholder="Type a label..." />)

      expect(getInput()).toHaveAttribute('placeholder', 'Type a label...')
    })

    it('clears the placeholder text once tags are present', () => {
      const initial: Tag[] = [{ id: 'a', text: 'alpha' }]
      render(<ControlledTagInput initialTags={initial} />)

      const input = getInput()
      expect(input).toHaveAttribute('placeholder', '')
      // Tag is rendered as Badge text content.
      expect(input.previousElementSibling).toHaveTextContent('alpha')
    })
  })

  describe('add via Enter', () => {
    it('adds a new tag on Enter with a trimmed value and clears the input', () => {
      const onTagsChange = vi.fn()
      render(
        <TagInput
          data-testid="tag-input"
          tags={[]}
          onTagsChange={onTagsChange}
        />
      )

      const input = getInput()
      fireEvent.change(input, { target: { value: '  hello  ' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(onTagsChange).toHaveBeenCalledTimes(1)
      const [next] = onTagsChange.mock.calls[0] as [Tag[]]
      expect(next).toHaveLength(1)
      expect(next[0]?.text).toBe('hello')
      // id is a UUID produced by crypto.randomUUID().
      expect(next[0]?.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      )

      // The input was cleared by addTag, but the parent hasn't applied
      // the new tag yet — the test framework's controlled harness keeps
      // inputValue local to the component, so it should be empty now.
      expect(input).toHaveValue('')
    })

    it('does not call onTagsChange when Enter is pressed with an empty value', () => {
      const onTagsChange = vi.fn()
      render(
        <TagInput
          data-testid="tag-input"
          tags={[]}
          onTagsChange={onTagsChange}
        />
      )

      const input = getInput()
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(onTagsChange).not.toHaveBeenCalled()
    })

    it('does not call onTagsChange when Enter is pressed with a whitespace-only value', () => {
      const onTagsChange = vi.fn()
      render(
        <TagInput
          data-testid="tag-input"
          tags={[]}
          onTagsChange={onTagsChange}
        />
      )

      const input = getInput()
      fireEvent.change(input, { target: { value: '   ' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(onTagsChange).not.toHaveBeenCalled()
      expect(input).toHaveValue('   ')
    })
  })

  describe('duplicate handling', () => {
    it('clears the input but does NOT call onTagsChange when a duplicate is entered with allowDuplicates=false (default)', () => {
      const onTagsChange = vi.fn()
      const initial: Tag[] = [{ id: 'a', text: 'hello' }]
      render(
        <TagInput
          data-testid="tag-input"
          tags={initial}
          onTagsChange={onTagsChange}
        />
      )

      const input = getInput()
      fireEvent.change(input, { target: { value: 'hello' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(onTagsChange).not.toHaveBeenCalled()
      // The component explicitly clears inputValue on a duplicate hit,
      // even when the tag itself is rejected.
      expect(input).toHaveValue('')
    })

    it('treats whitespace-trimmed duplicates the same way', () => {
      const onTagsChange = vi.fn()
      const initial: Tag[] = [{ id: 'a', text: 'hello' }]
      render(
        <TagInput
          data-testid="tag-input"
          tags={initial}
          onTagsChange={onTagsChange}
        />
      )

      const input = getInput()
      fireEvent.change(input, { target: { value: '  hello  ' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(onTagsChange).not.toHaveBeenCalled()
      expect(input).toHaveValue('')
    })

    it('adds a duplicate anyway when allowDuplicates=true', () => {
      const onTagsChange = vi.fn()
      const initial: Tag[] = [{ id: 'a', text: 'hello' }]
      render(
        <TagInput
          allowDuplicates
          data-testid="tag-input"
          tags={initial}
          onTagsChange={onTagsChange}
        />
      )

      const input = getInput()
      fireEvent.change(input, { target: { value: 'hello' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(onTagsChange).toHaveBeenCalledTimes(1)
      const [next] = onTagsChange.mock.calls[0] as [Tag[]]
      expect(next).toHaveLength(2)
      expect(next[0]?.text).toBe('hello')
      expect(next[1]?.text).toBe('hello')
      // The two ids must be distinct (each addTag mints a fresh UUID).
      expect(next[0]?.id).not.toBe(next[1]?.id)
    })
  })

  describe('maxTags limit', () => {
    it('rejects new tags once tags.length >= maxTags, and clears the input', () => {
      const onTagsChange = vi.fn()
      const initial: Tag[] = [
        { id: 'a', text: 'one' },
        { id: 'b', text: 'two' },
      ]
      render(
        <TagInput
          data-testid="tag-input"
          maxTags={2}
          tags={initial}
          onTagsChange={onTagsChange}
        />
      )

      const input = getInput()
      fireEvent.change(input, { target: { value: 'three' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(onTagsChange).not.toHaveBeenCalled()
      expect(input).toHaveValue('')
    })

    it('still accepts a new tag when tags.length is below maxTags', () => {
      const onTagsChange = vi.fn()
      const initial: Tag[] = [{ id: 'a', text: 'one' }]
      render(
        <TagInput
          data-testid="tag-input"
          maxTags={3}
          tags={initial}
          onTagsChange={onTagsChange}
        />
      )

      const input = getInput()
      fireEvent.change(input, { target: { value: 'two' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(onTagsChange).toHaveBeenCalledTimes(1)
      const [next] = onTagsChange.mock.calls[0] as [Tag[]]
      expect(next).toHaveLength(2)
      expect(next[1]?.text).toBe('two')
    })
  })

  describe('remove via X button', () => {
    it('calls onTagsChange with the filtered list when the X button is clicked', () => {
      const onTagsChange = vi.fn()
      const initial: Tag[] = [
        { id: 'a', text: 'alpha' },
        { id: 'b', text: 'beta' },
        { id: 'c', text: 'gamma' },
      ]
      render(
        <TagInput
          data-testid="tag-input"
          tags={initial}
          onTagsChange={onTagsChange}
        />
      )

      const removeBeta = screen.getByRole('button', { name: 'Remove beta tag' })
      fireEvent.click(removeBeta)

      expect(onTagsChange).toHaveBeenCalledTimes(1)
      const [next] = onTagsChange.mock.calls[0] as [Tag[]]
      expect(next).toEqual([
        { id: 'a', text: 'alpha' },
        { id: 'c', text: 'gamma' },
      ])
    })

    it('stops propagation on the X click so the container click handler does not focus the input', () => {
      const onTagsChange = vi.fn()
      const handleContainerClick = vi.fn()
      const initial: Tag[] = [{ id: 'a', text: 'alpha' }]
      render(
        <div onClick={handleContainerClick}>
          <TagInput
            data-testid="tag-input"
            tags={initial}
            onTagsChange={onTagsChange}
          />
        </div>
      )

      fireEvent.click(screen.getByRole('button', { name: 'Remove alpha tag' }))

      expect(onTagsChange).toHaveBeenCalledTimes(1)
      expect(handleContainerClick).not.toHaveBeenCalled()
    })
  })

  describe('remove via Backspace', () => {
    it('removes the last tag when Backspace is pressed with an empty input', () => {
      const onTagsChange = vi.fn()
      const initial: Tag[] = [
        { id: 'a', text: 'alpha' },
        { id: 'b', text: 'beta' },
      ]
      render(
        <TagInput
          data-testid="tag-input"
          tags={initial}
          onTagsChange={onTagsChange}
        />
      )

      const input = getInput()
      expect(input).toHaveValue('')
      fireEvent.keyDown(input, { key: 'Backspace' })

      expect(onTagsChange).toHaveBeenCalledTimes(1)
      const [next] = onTagsChange.mock.calls[0] as [Tag[]]
      expect(next).toEqual([{ id: 'a', text: 'alpha' }])
    })

    it('does NOT remove a tag when Backspace is pressed while the input has text', () => {
      const onTagsChange = vi.fn()
      const initial: Tag[] = [{ id: 'a', text: 'alpha' }]
      render(
        <TagInput
          data-testid="tag-input"
          tags={initial}
          onTagsChange={onTagsChange}
        />
      )

      const input = getInput()
      fireEvent.change(input, { target: { value: 'h' } })
      fireEvent.keyDown(input, { key: 'Backspace' })

      expect(onTagsChange).not.toHaveBeenCalled()
    })

    it('does NOT remove a tag when Backspace is pressed with no tags present', () => {
      const onTagsChange = vi.fn()
      render(
        <TagInput
          data-testid="tag-input"
          tags={[]}
          onTagsChange={onTagsChange}
        />
      )

      fireEvent.keyDown(getInput(), { key: 'Backspace' })
      expect(onTagsChange).not.toHaveBeenCalled()
    })
  })

  describe('Escape', () => {
    it('clears the input value and blurs the input', () => {
      render(<ControlledTagInput />)

      const input = getInput()
      input.focus()
      expect(document.activeElement).toBe(input)

      fireEvent.change(input, { target: { value: 'draft text' } })
      fireEvent.keyDown(input, { key: 'Escape' })

      expect(input).toHaveValue('')
      expect(document.activeElement).not.toBe(input)
    })

    it('still clears + blurs when Escape is pressed with an empty input', () => {
      render(<ControlledTagInput />)

      const input = getInput()
      input.focus()
      fireEvent.keyDown(input, { key: 'Escape' })

      expect(input).toHaveValue('')
      expect(document.activeElement).not.toBe(input)
    })
  })

  describe('container click focuses input', () => {
    it('focuses the inner input when the wrapper div is clicked', () => {
      render(<ControlledTagInput />)

      const container = getContainer()
      const input = getInput()
      expect(document.activeElement).not.toBe(input)

      fireEvent.click(container)
      expect(document.activeElement).toBe(input)
    })

    it('does NOT focus the inner input when the disabled wrapper is clicked', () => {
      render(<ControlledTagInput disabled />)

      const container = getContainer()
      const input = getInput()
      expect(document.activeElement).not.toBe(input)

      fireEvent.click(container)
      expect(document.activeElement).not.toBe(input)
    })
  })

  describe('disabled', () => {
    it('renders the disabled styling classes on the wrapper', () => {
      render(<ControlledTagInput disabled />)

      const container = getContainer()
      expect(container).toHaveClass('cursor-not-allowed')
      expect(container).toHaveClass('opacity-50')
    })

    it('disables the inner input', () => {
      render(<ControlledTagInput disabled />)
      expect(getInput()).toBeDisabled()
    })

    it('hides the X button for each tag', () => {
      const initial: Tag[] = [
        { id: 'a', text: 'alpha' },
        { id: 'b', text: 'beta' },
      ]
      render(<ControlledTagInput disabled initialTags={initial} />)

      expect(
        screen.queryByRole('button', { name: /Remove .* tag/ })
      ).not.toBeInTheDocument()
    })

    it('does not call onTagsChange when Enter is pressed in disabled mode', () => {
      const onTagsChange = vi.fn()
      render(
        <TagInput
          data-testid="tag-input"
          disabled
          tags={[]}
          onTagsChange={onTagsChange}
        />
      )

      const input = getInput()
      // The native disabled <input> won't fire keyDown when the user
      // can't interact with it, so simulate the handler directly via
      // the synthetic React tree (still wired even when the input is
      // disabled at the DOM level).
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(onTagsChange).not.toHaveBeenCalled()
    })

    it('does not call onTagsChange when Backspace is pressed in disabled mode', () => {
      const onTagsChange = vi.fn()
      const initial: Tag[] = [{ id: 'a', text: 'alpha' }]
      render(
        <TagInput
          data-testid="tag-input"
          disabled
          tags={initial}
          onTagsChange={onTagsChange}
        />
      )

      fireEvent.keyDown(getInput(), { key: 'Backspace' })
      expect(onTagsChange).not.toHaveBeenCalled()
    })
  })

  describe('className merging', () => {
    it('merges a custom className alongside the cn() base classes', () => {
      render(<ControlledTagInput className="custom-tag-input" />)

      const container = getContainer()
      expect(container).toHaveClass('custom-tag-input')
      // Spot-check a representative base class to confirm cn() ran.
      expect(container).toHaveClass('rounded-[var(--radius)]')
    })

    it('still applies the disabled styling classes when both className and disabled are passed', () => {
      render(<ControlledTagInput className="my-class" disabled />)

      const container = getContainer()
      expect(container).toHaveClass('my-class')
      expect(container).toHaveClass('cursor-not-allowed')
      expect(container).toHaveClass('opacity-50')
    })
  })

  describe('props forwarding', () => {
    it('forwards id, aria-*, data-*, title, and event handlers onto the wrapper div', () => {
      const handleClick = vi.fn()
      render(
        <ControlledTagInput
          aria-label="tag list"
          data-custom="custom-value"
          id="tag-input-id"
          onClick={handleClick}
          title="tag input title"
        />
      )

      const container = getContainer()
      expect(container).toHaveAttribute('id', 'tag-input-id')
      expect(container).toHaveAttribute('aria-label', 'tag list')
      expect(container).toHaveAttribute('data-custom', 'custom-value')
      expect(container).toHaveAttribute('title', 'tag input title')

      // A user-supplied onClick runs in addition to the container's
      // built-in click handler (which focuses the input).
      fireEvent.click(container)
      expect(handleClick).toHaveBeenCalledTimes(1)
    })

    it('forwards onto the wrapper div, not onto the inner <input>', () => {
      render(
        <TagInput
          data-testid="tag-input"
          id="outer-id"
          onTagsChange={vi.fn()}
          tags={[]}
          title="outer-title"
        />
      )

      const container = getContainer()
      // The id / title / data-testid land on the wrapper.
      expect(container).toHaveAttribute('id', 'outer-id')
      expect(container).toHaveAttribute('title', 'outer-title')

      // The input itself has no id by default — confirming the outer
      // wrapper is the destination of {...props}.
      const input = getInput()
      expect(input.id).toBe('')
      expect(input).not.toHaveAttribute('title', 'outer-title')
    })
  })

  describe('ref forwarding', () => {
    it('captures the outer wrapper div via React 19 ref-as-prop', () => {
      const ref = createRef<HTMLDivElement>()
      render(
        <TagInput
          data-testid="tag-input"
          onTagsChange={vi.fn()}
          ref={ref}
          tags={[]}
        />
      )

      expect(ref.current).not.toBeNull()
      expect(ref.current).toBeInstanceOf(HTMLDivElement)
      expect(ref.current).toBe(getContainer())
    })

    it('captures the wrapper even when it has no tags', () => {
      const ref = createRef<HTMLDivElement>()
      render(
        <TagInput
          data-testid="tag-input"
          onTagsChange={vi.fn()}
          ref={ref}
          tags={[]}
        />
      )

      expect(ref.current).not.toBeNull()
      expect(ref.current?.tagName).toBe('DIV')
    })
  })
})
