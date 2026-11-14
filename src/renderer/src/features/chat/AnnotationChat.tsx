/**
 * Annotation-scoped AI conversation with optional screenshot attachments.
 * RegionPanel owns note drafts and persistence; this component owns only the
 * question composer, request cancellation, and rendered conversation state.
 */
import { Bot, Image as ImageIcon, Paperclip, Send, Square, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { annotationKind, type ChatMessage, type RegionRecord } from '@shared/domain/models'
import { useI18n } from '../../i18n/I18nProvider'

interface Props {
  region: RegionRecord
  annotationContext: string
  conversation: ChatMessage[]
  onConversationChange(conversation: ChatMessage[]): void
  transientImages: TransientChatImage[]
  questionRequest?: { id: string; question: string }
  onRemoveTransientImage(id: string): void
  onAsk(region: RegionRecord, question: string, history: ChatMessage[], annotationContext: string, includeRegionImage: boolean, imageDataUrls: string[], requestId: string): Promise<string>
  onCancelAsk(requestId: string): Promise<void>
}

export interface TransientChatImage {
  id: string
  dataUrl: string
}

export function AnnotationChat({ region, annotationContext, conversation, transientImages, questionRequest, onRemoveTransientImage, onConversationChange, onAsk, onCancelAsk }: Props): React.JSX.Element {
  const { t } = useI18n()
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const activeRequestId = useRef<string | undefined>(undefined)
  const questionRef = useRef<HTMLTextAreaElement>(null)
  const isSnapshot = annotationKind(region) === 'snapshot'
  const [imageAttached, setImageAttached] = useState(isSnapshot)

  useEffect(() => {
    setQuestion('')
    setImageAttached(annotationKind(region) === 'snapshot')
  }, [region.note.id])

  useEffect(() => {
    if (!questionRequest) return
    setQuestion(questionRequest.question)
    window.requestAnimationFrame(() => questionRef.current?.focus())
  }, [questionRequest?.id])

  const ask = async (): Promise<void> => {
    if (!question.trim() || asking) return
    const prompt = question.trim()
    const requestId = crypto.randomUUID()
    activeRequestId.current = requestId
    const user: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: prompt, createdAt: new Date().toISOString() }
    onConversationChange([...conversation, user])
    setQuestion('')
    setAsking(true)
    try {
      const answer = await onAsk(region, prompt, conversation, annotationContext, imageAttached, transientImages.map((image) => image.dataUrl), requestId)
      onConversationChange([...conversation, user, { id: crypto.randomUUID(), role: 'assistant', content: answer, createdAt: new Date().toISOString() }])
    } catch {
      onConversationChange(conversation)
    } finally {
      setAsking(false)
      activeRequestId.current = undefined
    }
  }

  const cancel = async (): Promise<void> => {
    const requestId = activeRequestId.current
    if (!requestId) return
    await onCancelAsk(requestId)
  }

  return (
    <div className="chat-section">
      <div className="section-label"><Bot size={14} /> {t('region.chat')}</div>
      <div className="chat-messages">
        {conversation.length === 0 && <p className="empty-copy">{t('region.chatEmpty')}</p>}
        {conversation.map((message) => <div key={message.id} className={`chat-message ${message.role}`}><span>{message.role === 'user' ? t('region.you') : 'AI'}</span><p>{message.content}</p></div>)}
        {asking && <div className="chat-message assistant pending"><span>AI</span><p>{t('region.viewing')}</p></div>}
      </div>
      {(isSnapshot || transientImages.length > 0) && <div className="chat-attachment-strip">
        {isSnapshot && imageAttached && <div className="chat-image-tile primary"><img src={region.asset.previewDataUrl} alt={t('region.chatAttachment')} /><span><ImageIcon size={11} />{t('region.chatAttachment')}</span><button type="button" disabled={asking} title={t('region.chatDetach')} onClick={() => setImageAttached(false)}><X size={12} /></button></div>}
        {transientImages.map((image, index) => <div className="chat-image-tile" key={image.id}><img src={image.dataUrl} alt={t('region.systemScreenshot', { count: index + 1 })} /><span>{index + 1}</span><button type="button" disabled={asking} title={t('region.chatDetach')} onClick={() => onRemoveTransientImage(image.id)}><X size={12} /></button></div>)}
      </div>}
      {isSnapshot && !imageAttached && <button type="button" className="chat-attach-button" disabled={asking} onClick={() => setImageAttached(true)}><Paperclip size={14} />{t('region.chatAttach')}</button>}
      <div className="chat-input">
        <textarea ref={questionRef} rows={2} value={question} placeholder={t('region.questionPlaceholder')} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void ask() } }} />
        {asking
          ? <button type="button" className="icon-button" onClick={() => void cancel()}><Square size={15} /></button>
          : <button type="button" className="icon-button primary" disabled={!question.trim()} onClick={() => void ask()}><Send size={16} /></button>}
      </div>
    </div>
  )
}
