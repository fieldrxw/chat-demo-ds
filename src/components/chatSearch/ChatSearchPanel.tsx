import { useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { useTranslate } from '../../i18n/index.js'
import { selectSession } from '../../services/chat/store.js'
import { searchChatSessions, type ChatSearchHit } from '../../services/chat/search.js'
import { requestLocate } from '../../services/chat/locate.js'
import { formatDate } from '../../utils/format.js'
import { IconCloseOutline16 } from '../base/icons.js'
import { IconButton } from '../base/IconButton.js'
import { closeChatSearch, openChatSearch, useChatSearch } from './chatSearchState.js'
import styles from './ChatSearchPanel.module.css'

/** 关键词高亮：按命中的原文形式切分，<mark> 走主题色 */
const Highlighted = ({ text, terms }: { text: string; terms: string[] }) => {
  const parts = useMemo(() => {
    if (terms.length === 0) {
      return [{ text, hit: false }]
    }
    const needles = terms.map((term) => term.toLowerCase())
    const lower = text.toLowerCase()
    const segments: { text: string; hit: boolean }[] = []
    let cursor = 0
    while (cursor < text.length) {
      let nearest = -1
      for (const needle of needles) {
        const index = lower.indexOf(needle, cursor)
        if (index !== -1 && (nearest === -1 || index < nearest)) {
          nearest = index
        }
      }
      if (nearest === -1) {
        segments.push({ text: text.slice(cursor), hit: false })
        break
      }
      if (nearest > cursor) {
        segments.push({ text: text.slice(cursor, nearest), hit: false })
      }
      const hitLength = needles
        .map((needle) =>
          lower.startsWith(needle, nearest)
            ? lower.slice(nearest, nearest + needle.length).length
            : 0
        )
        .reduce((max, length) => Math.max(max, length), 0)
      if (hitLength === 0) {
        segments.push({ text: text.slice(nearest), hit: false })
        break
      }
      segments.push({ text: text.slice(nearest, nearest + hitLength), hit: true })
      cursor = nearest + hitLength
    }
    return segments
  }, [text, terms])
  return (
    <>
      {parts.map((part, index) =>
        part.hit ? (
          <mark key={index} className={styles.mark}>
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        )
      )}
    </>
  )
}

const formatTime = (updatedAt: number): string => formatDate(updatedAt, '/') ?? String(updatedAt)

/**
 * 会话全文检索面板（FR-3）：输入实时检索全部会话的标题与消息内容，
 * 多关键词 AND、不区分大小写，按最近更新时间排序，命中片段高亮。
 * 点击结果打开对应会话并定位到命中消息（FR-4）；Esc / 点击面板外部关闭。
 * 关闭时不渲染，不阻塞页面。
 */
export const ChatSearchPanel = () => {
  const t = useTranslate()
  const open = useChatSearch((state) => state.open)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<ChatSearchHit[] | null>(null)
  const [searching, setSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const searchIdRef = useRef(0)

  // 每次打开重置为空检索态
  useEffect(() => {
    if (open) {
      searchIdRef.current += 1
      setQuery('')
      setHits(null)
      setSearching(false)
    }
  }, [open])

  // 输入实时检索（~150ms 防抖），过期响应丢弃
  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed === '') {
      setHits(null)
      setSearching(false)
      return
    }
    setSearching(true)
    const searchId = ++searchIdRef.current
    const timer = setTimeout(() => {
      void searchChatSessions(trimmed).then((result) => {
        if (searchIdRef.current === searchId) {
          setHits(result)
          setSearching(false)
        }
      })
    }, 150)
    return () => clearTimeout(timer)
  }, [query])

  // Esc 关闭 + 点击面板外部关闭（仅打开时监听）
  useEffect(() => {
    if (!open) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeChatSearch()
      }
    }
    const onMouseDown = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        // 点击触发按钮时交给按钮自身的开合逻辑处理
        const target = event.target as HTMLElement
        if (target.closest('[data-chat-search-entry]')) {
          return
        }
        closeChatSearch()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onMouseDown)
    inputRef.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onMouseDown)
    }
  }, [open])

  const openHit = (hit: ChatSearchHit) => {
    selectSession(hit.sessionId)
    // 仅标题命中只打开会话，不做消息定位（FR-4）
    if (hit.messageId) {
      requestLocate(hit.sessionId, hit.messageId)
    }
    closeChatSearch()
  }

  const showEmpty = hits !== null && hits.length === 0 && !searching
  if (!open) {
    return null
  }
  return (
    <div ref={panelRef} className={styles.panel} role="dialog" aria-label={t('chatSearchButton')}>
      <div className={styles.header}>
        <input
          ref={inputRef}
          type="text"
          className={styles.input}
          value={query}
          placeholder={t('chatSearchPlaceholder')}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
        />
        <IconButton
          icon={<IconCloseOutline16 />}
          aria-label={t('close')}
          onClick={closeChatSearch}
        />
      </div>
      <div className={styles.results}>
        {searching && hits === null ? null : showEmpty ? (
          <div className={styles.empty}>{t('chatSearchNoResult')}</div>
        ) : (
          hits?.map((hit, index) => (
            <button
              key={`${hit.sessionId}-${hit.messageId ?? 'title'}-${index}`}
              type="button"
              className={styles.result}
              onClick={() => openHit(hit)}
            >
              <div className={styles.resultTop}>
                <span className={styles.resultTitle}>{hit.sessionTitle || t('untitledChat')}</span>
                <span className={styles.resultTime}>{formatTime(hit.updatedAt)}</span>
              </div>
              <div className={styles.resultSnippet}>
                {hit.messageId ? (
                  <Highlighted text={hit.snippet} terms={hit.terms} />
                ) : (
                  <span className={styles.titleOnly}>
                    <Highlighted text={hit.snippet} terms={hit.terms} />
                    {' · '}
                    {t('chatSearchTitleHit')}
                  </span>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

/** 搜索入口按钮（侧栏顶部，收起按钮旁） */
export const ChatSearchButton = ({ className }: { className?: string }) => {
  const t = useTranslate()
  return (
    <button
      type="button"
      data-chat-search-entry
      className={clsx(styles.entryButton, className)}
      aria-label={t('chatSearchButton')}
      title={t('chatSearchButton')}
      onClick={() => (useChatSearch.getState().open ? closeChatSearch() : openChatSearch())}
    >
      <svg
        width={16}
        height={16}
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M11.748 6.7028C11.748 3.90104 9.47653 1.62976 6.6748 1.62956C3.87291 1.62956 1.60156 3.90091 1.60156 6.7028C1.60176 9.50453 3.87304 11.776 6.6748 11.776C9.47641 11.7759 11.7479 9.50441 11.748 6.7028ZM13.0479 6.7028C13.0477 10.2224 10.1944 13.0757 6.6748 13.0759C3.15507 13.0759 0.300977 10.2225 0.300781 6.7028C0.300781 3.18294 3.15494 0.328781 6.6748 0.328781C10.1945 0.328977 13.0479 3.18307 13.0479 6.7028Z"
          fill="currentColor"
        />
        <path
          d="M15.6991 14.7513L14.7792 15.6712L11.3974 12.2894L12.3173 11.3694L15.6991 14.7513Z"
          fill="currentColor"
        />
      </svg>
    </button>
  )
}
