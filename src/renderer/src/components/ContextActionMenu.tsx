/**
 * Shared pointer-positioned context menu for object-level shortcuts.
 * Feature modules provide actions and retain their normal visible controls;
 * this component adds a convenience path without owning domain behavior.
 */
import { useEffect, useRef } from 'react'
import type { ActionMenuItem } from './ActionMenu'

interface Props {
  x: number
  y: number
  label: string
  items: ActionMenuItem[]
  onDismiss(): void
}

export function ContextActionMenu({ x, y, label, items, onDismiss }: Props): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const left = Math.max(8, Math.min(x, window.innerWidth - 230))
  const top = Math.max(8, Math.min(y, window.innerHeight - (items.length * 38 + 20)))

  useEffect(() => {
    const dismiss = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) onDismiss()
    }
    document.addEventListener('mousedown', dismiss)
    itemRefs.current.find((item) => item && !item.disabled)?.focus()
    return () => document.removeEventListener('mousedown', dismiss)
  }, [onDismiss])

  const moveFocus = (direction: 1 | -1): void => {
    const enabled = itemRefs.current.filter((item): item is HTMLButtonElement => Boolean(item && !item.disabled))
    if (!enabled.length) return
    const current = enabled.indexOf(document.activeElement as HTMLButtonElement)
    enabled[(current + direction + enabled.length) % enabled.length]?.focus()
  }

  return (
    <div
      ref={rootRef}
      className="context-action-menu"
      style={{ left, top }}
      role="menu"
      aria-label={label}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown') { event.preventDefault(); moveFocus(1) }
        if (event.key === 'ArrowUp') { event.preventDefault(); moveFocus(-1) }
        if (event.key === 'Escape') { event.preventDefault(); onDismiss() }
      }}
    >
      {items.map((item, index) => (
        <button
          type="button"
          role="menuitem"
          key={item.id}
          ref={(element) => { itemRefs.current[index] = element }}
          className={`${item.separatorBefore ? 'with-separator' : ''} ${item.tone === 'danger' ? 'danger' : ''}`}
          disabled={item.disabled}
          onClick={() => { onDismiss(); item.onSelect() }}
        >
          {item.icon}<span>{item.label}</span>
        </button>
      ))}
    </div>
  )
}
