import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useIsMobile } from '../../app/viewport.js'
import {
  buildMessageVersions,
  getVisibleMessages,
  type MessageVersions,
} from '../../services/chat/branches.js'
import { consumeLocate, useLocate } from '../../services/chat/locate.js'
import { selectMessageVersion } from '../../services/chat/store.js'
import type { Session } from '../../services/chat/types.js'
import { closeSearchPanel } from '../search/searchPanelState.js'
import { AssistantMessage } from './AssistantMessage.js'
import { ScrollToBottomContext } from './scrollContext.js'
import { UserMessage } from './UserMessage.js'
import type { Message } from '../../services/chat/types.js'

/**
 * 会话共用可重试的附件上传失败入口，覆盖当前提问与历史消息中的附件。
 * 点击后按失败的回答重新补传附件并请求。
 */
const getUploadRetryId = (messages: Message[], streaming: boolean) => {
  const last = messages.at(-1)
  return !streaming &&
    last?.role === 'assistant' &&
    last.status === 'error' &&
    last.error?.kind === 'upload' &&
    last.error.retryable
    ? last.id
    : null
}
import styles from './MessageList.module.css'

/** 距底部小于该值时视为在底部，流式内容增长时跟随 */
const STICKY_THRESHOLD = 40
const EMPTY_VERSIONS: MessageVersions = { ids: [], index: -1 }

export const MessageList = ({
  session,
  streaming,
  footer,
  onScrollElement,
}: {
  session: Session
  streaming: boolean
  footer: React.ReactNode
  /** 向父级（锚点导航）暴露滚动容器（FR-5） */
  onScrollElement?: (element: HTMLElement | null) => void
}) => {
  const isMobile = useIsMobile()
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const stickyRef = useRef(true)
  const scrollTopRef = useRef(0)
  const restoreScrollRef = useRef<{ messageId: string; top: number } | null>(null)
  /** 定位高亮（FR-4）的收尾句柄；独立于 effect 清理周期，避免被 consumeLocate 的重渲染取消 */
  const highlightCleanupRef = useRef<(() => void) | null>(null)
  const messages = getVisibleMessages(session)
  const [previousVersions, setPreviousVersions] = useState(() =>
    buildMessageVersions(session, new Map())
  )
  const versions = useMemo(
    () => buildMessageVersions(session, previousVersions),
    [session, previousVersions]
  )
  if (versions !== previousVersions) {
    setPreviousVersions(versions)
  }
  const lastMessageId = messages.at(-1)?.id
  // 锚点导航需要滚动容器元素；桌面端在 .container、移动端在 .scroll（FR-5）
  useEffect(() => {
    onScrollElement?.(scrollRef.current)
  }, [isMobile, onScrollElement])
  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current
    if (el && stickyRef.current) {
      el.scrollTop = el.scrollHeight
      scrollTopRef.current = el.scrollTop
    }
  }, [])

  // 内容、键盘和输入框高度变化时，继续遵循当前跟随状态。
  useLayoutEffect(() => {
    const content = contentRef.current
    const scroll = scrollRef.current
    if (!content || !scroll) {
      return
    }
    const observer = new ResizeObserver(scrollToBottom)
    observer.observe(content)
    observer.observe(scroll)
    return () => observer.disconnect()
  }, [isMobile, scrollToBottom])

  // 切换版本后将选择器留在原位置，避免回答长短变化导致操作区跳出视口。
  useLayoutEffect(() => {
    const anchor = restoreScrollRef.current
    const scroll = scrollRef.current
    if (anchor && scroll) {
      const switcher = scroll.querySelector<HTMLElement>(
        `[data-message-version="${CSS.escape(anchor.messageId)}"]`
      )
      if (switcher) {
        scroll.scrollTop += switcher.getBoundingClientRect().top - anchor.top
      }
      restoreScrollRef.current = null
      return
    }
    stickyRef.current = true
    scrollToBottom()
  }, [session.id, lastMessageId, scrollToBottom])

  useEffect(closeSearchPanel, [session.id, lastMessageId])

  /**
   * 搜索结果定位（FR-4）：会话打开且命中消息已渲染后滚动到该消息，
   * 使其中部大致居于可视区中央，再以描边高亮约 2 秒。
   * 平滑滚动优先；能力受限（不支持 scrollIntoView 平滑选项或用户偏好减少动画）时直接落位，
   * 保证最终停留位置正确（非功能 4）。
   */
  const pendingLocate = useLocate((state) => state.pending)
  useEffect(() => {
    const scroll = scrollRef.current
    if (
      !scroll ||
      !pendingLocate ||
      pendingLocate.sessionId !== session.id ||
      !pendingLocate.messageId
    ) {
      return
    }
    const target = scroll.querySelector<HTMLElement>(
      `[data-message-id="${CSS.escape(pendingLocate.messageId)}"]`
    )
    if (!target) {
      // 消息尚未渲染（如长列表分批）：等下一帧再试，由本副作用的重渲染驱动
      return
    }
    consumeLocate(session.id)
    stickyRef.current = false
    scrollTopRef.current = scroll.scrollTop
    const reduceMotion =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    const centerTop = () => {
      // 消息中部 ≈ 视区中央（受限环境下的精确落位）；用 rect 差值避免依赖 offsetParent
      const scrollRect = scroll.getBoundingClientRect()
      const targetRect = target.getBoundingClientRect()
      scroll.scrollTop =
        scroll.scrollTop +
        (targetRect.top - scrollRect.top) +
        target.offsetHeight / 2 -
        scroll.clientHeight / 2
      scrollTopRef.current = scroll.scrollTop
    }
    // 高亮独立于本 effect 的清理周期（consumeLocate 会立即触发清理），
    // 上一次高亮先收尾再开启新的；2 秒后自动移除描边（FR-4）。
    if (highlightCleanupRef.current) {
      highlightCleanupRef.current()
    }
    const highlight = () => {
      target.classList.add(styles.locateHighlight)
      const timer = setTimeout(() => {
        target.classList.remove(styles.locateHighlight)
        if (highlightCleanupRef.current === cleanup) {
          highlightCleanupRef.current = null
        }
      }, 2000)
      const cleanup = () => {
        clearTimeout(timer)
        target.classList.remove(styles.locateHighlight)
      }
      highlightCleanupRef.current = cleanup
    }
    const canSmooth = !reduceMotion && typeof target.scrollIntoView === 'function'
    if (canSmooth) {
      // rAF 探测 scrollTop 连续稳定后再高亮；scrollend 兼容性差，用双帧稳定替代（风险 3）
      let lastTop = -1
      let stableFrames = 0
      let settled = false
      const watch = () => {
        if (settled) {
          return
        }
        if (Math.abs(scroll.scrollTop - lastTop) < 1) {
          stableFrames += 1
          if (stableFrames >= 3) {
            settled = true
            scrollTopRef.current = scroll.scrollTop
            highlight()
            return
          }
        } else {
          stableFrames = 0
          lastTop = scroll.scrollTop
        }
        requestAnimationFrame(watch)
      }
      requestAnimationFrame(watch)
      target.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } else {
      centerTop()
      highlight()
    }
    return () => {
      // 仅重置状态；进行中的高亮由自身计时器收尾，滚动探测由 settled 停止
    }
  }, [pendingLocate, session.id, lastMessageId])

  const selectVersion = useCallback(
    (messageId: string, anchorTop: number) => {
      if (streaming) {
        return
      }
      restoreScrollRef.current = { messageId, top: anchorTop }
      stickyRef.current = false
      closeSearchPanel()
      selectMessageVersion(session.id, messageId)
    },
    [session.id, streaming]
  )

  // 跨移动端断点时切换滚动层，并保持输入框及当前阅读位置。
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) {
      return
    }
    if (stickyRef.current) {
      scrollToBottom()
    } else {
      el.scrollTop = scrollTopRef.current
    }
    const onScroll = () => {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < STICKY_THRESHOLD
      // 仅在用户向上滚动时停止跟随底部，布局或内容增高时保持跟随状态。
      if (nearBottom) {
        stickyRef.current = true
      } else if (el.scrollTop < scrollTopRef.current) {
        stickyRef.current = false
      }
      scrollTopRef.current = el.scrollTop
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [isMobile, scrollToBottom])

  const lastIndex = messages.length - 1
  const uploadRetryId = getUploadRetryId(messages, streaming)
  return (
    <ScrollToBottomContext.Provider value={scrollToBottom}>
      <div ref={isMobile ? undefined : scrollRef} className={styles.container}>
        <div ref={isMobile ? scrollRef : undefined} className={styles.scroll}>
          <div ref={contentRef} className={styles.column}>
            {messages.map((message, index) =>
              message.role === 'user' ? (
                <UserMessage
                  key={message.id}
                  sessionId={session.id}
                  message={message}
                  retryUploadId={uploadRetryId}
                  isFirst={index === 0}
                  isLast={index === lastIndex || index === lastIndex - 1}
                  busy={streaming}
                  versions={versions.get(message.id) ?? EMPTY_VERSIONS}
                  onSelectVersion={selectVersion}
                />
              ) : (
                <AssistantMessage
                  key={message.id}
                  sessionId={session.id}
                  message={message}
                  isLast={index === lastIndex}
                  streaming={streaming && index === lastIndex}
                  busy={streaming}
                  versions={versions.get(message.id) ?? EMPTY_VERSIONS}
                  onSelectVersion={selectVersion}
                />
              )
            )}
          </div>
        </div>
        {footer}
      </div>
    </ScrollToBottomContext.Provider>
  )
}
