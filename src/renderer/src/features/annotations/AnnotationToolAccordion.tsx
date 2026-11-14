/**
 * Controlled accordion section for the annotation workspace.
 * RegionPanel owns which tool is open so quick-action requests can reveal the correct section.
 */
import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'

interface Props {
  title: string
  description: string
  icon: ReactNode
  open: boolean
  onToggle(): void
  children: ReactNode
}

export function AnnotationToolAccordion({ title, description, icon, open, onToggle, children }: Props): React.JSX.Element {
  return <section className={`annotation-tool-section ${open ? 'open' : ''}`}>
    <button type="button" className="annotation-tool-heading" aria-expanded={open} onClick={onToggle}>
      <span className="annotation-tool-icon">{icon}</span>
      <span><strong>{title}</strong><small>{description}</small></span>
      <ChevronDown size={16} />
    </button>
    {open && <div className="annotation-tool-content">{children}</div>}
  </section>
}
