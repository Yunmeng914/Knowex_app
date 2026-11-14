/**
 * Shared compact action menu for top-level and feature commands.
 * Callers own business behavior; this component only manages accessible menu
 * presentation, focus movement, dismissal, and visual grouping.
 */
import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

export interface ActionMenuItem {
  id: string
  label: string
  icon?: React.ReactNode
  disabled?: boolean
  separatorBefore?: boolean
  tone?: 'default' | 'danger'
  onSelect(): void
}

interface Props {
  label: string
  icon?: React.ReactNode
  items: ActionMenuItem[]
  disabled?: boolean
}

export function ActionMenu({ label, icon, items, disabled }: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    if (!open) return
    const dismiss = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', dismiss)
    itemRefs.current.find((item) => item && !item.disabled)?.focus()
    return () => document.removeEventListener('mousedown', dismiss)
  }, [open])

  const moveFocus = (direction: 1 | -1): void => {
    const enabled = itemRefs.current.filter((item): item is HTMLButtonElement => Boolean(item && !item.disabled))
    if (!enabled.length) return
    const current = enabled.indexOf(document.activeElement as HTMLButtonElement)
    enabled[(current + direction + enabled.length) % enabled.length]?.focus()
  }

  return (
    <div className="action-menu" ref={rootRef}>
      <button
        type="button"
        className={`button action-menu-trigger ${open ? 'active' : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true) }
        }}
      >
        {icon}{label}<ChevronDown size={14} />
      </button>
      {open && (
        <div
          className="action-menu-popover"
          role="menu"
          aria-label={label}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') { event.preventDefault(); moveFocus(1) }
            if (event.key === 'ArrowUp') { event.preventDefault(); moveFocus(-1) }
            if (event.key === 'Escape') { event.preventDefault(); setOpen(false) }
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
              onClick={() => { setOpen(false); item.onSelect() }}
            >
              {item.icon}<span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
