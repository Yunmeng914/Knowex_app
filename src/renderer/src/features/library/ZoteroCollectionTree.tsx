import { BookOpen, Folder } from 'lucide-react'
import type { ZoteroAttachment } from '@shared/domain/models'
import { useI18n } from '../../i18n/I18nProvider'

export interface ZoteroTreeNode {
  key: string
  name: string
  children: ZoteroTreeNode[]
  attachments: ZoteroAttachment[]
}

interface Props {
  attachments: ZoteroAttachment[]
  detailed?: boolean
  onOpen(attachment: ZoteroAttachment): void
  onConfigure(attachment: ZoteroAttachment): void
}

export function ZoteroCollectionTree({ attachments, detailed = false, onOpen, onConfigure }: Props): React.JSX.Element {
  const { t } = useI18n()
  const tree = buildZoteroCollectionTree(attachments, t('library.zoteroUnfiled'))
  return <div className={`zotero-tree ${detailed ? 'detailed' : ''}`}>{tree.map((node) => <CollectionNode key={node.key} node={node} depth={0} detailed={detailed} onOpen={onOpen} onConfigure={onConfigure} />)}</div>
}

export function buildZoteroCollectionTree(attachments: ZoteroAttachment[], unfiledName: string): ZoteroTreeNode[] {
  const roots = new Map<string, MutableNode>()
  for (const attachment of attachments) {
    const paths = attachment.collectionPaths?.length ? attachment.collectionPaths : [[unfiledName]]
    for (const rawPath of paths) {
      const path = rawPath.map((part) => part.trim()).filter(Boolean)
      if (!path.length) path.push(unfiledName)
      let level = roots
      let node: MutableNode | undefined
      const keys: string[] = []
      for (const name of path) {
        keys.push(name)
        const key = keys.join('\u001f')
        node = level.get(name)
        if (!node) {
          node = { key, name, children: new Map(), attachments: new Map() }
          level.set(name, node)
        }
        level = node.children
      }
      node?.attachments.set(attachment.key, attachment)
    }
  }
  return materialize(roots)
}

interface MutableNode {
  key: string
  name: string
  children: Map<string, MutableNode>
  attachments: Map<string, ZoteroAttachment>
}

function materialize(nodes: Map<string, MutableNode>): ZoteroTreeNode[] {
  return [...nodes.values()].sort((a, b) => a.name.localeCompare(b.name)).map((node) => ({
    key: node.key,
    name: node.name,
    children: materialize(node.children),
    attachments: [...node.attachments.values()].sort((a, b) => a.title.localeCompare(b.title))
  }))
}

function CollectionNode({ node, depth, detailed, onOpen, onConfigure }: { node: ZoteroTreeNode; depth: number; detailed: boolean; onOpen(attachment: ZoteroAttachment): void; onConfigure(attachment: ZoteroAttachment): void }): React.JSX.Element {
  const { t } = useI18n()
  return <details className="zotero-tree-folder" open={depth === 0}>
    <summary><Folder size={15} /><span>{node.name}</span><small>{countAttachments(node)}</small></summary>
    <div className="zotero-tree-children">
      {node.children.map((child) => <CollectionNode key={child.key} node={child} depth={depth + 1} detailed={detailed} onOpen={onOpen} onConfigure={onConfigure} />)}
      {node.attachments.map((attachment) => <button
        type="button"
        className="zotero-tree-item"
        key={attachment.key}
        title={t('zotero.changeSyncHint')}
        onClick={() => onOpen(attachment)}
        onContextMenu={(event) => { event.preventDefault(); onConfigure(attachment) }}
      ><BookOpen size={15} /><span><strong>{attachment.title}</strong>{detailed && <small>{[attachment.creators, attachment.year, attachment.filename].filter(Boolean).join(' · ')}</small>}</span></button>)}
    </div>
  </details>
}

function countAttachments(node: ZoteroTreeNode): number {
  return node.attachments.length + node.children.reduce((total, child) => total + countAttachments(child), 0)
}
