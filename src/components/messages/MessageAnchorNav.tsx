import { useEffect, useMemo, useRef, useState } from 'react'
import { useIsMobile } from '../../app/viewport.js'
import { getVisibleMessages } from '../../services/chat/branches.js'
import type { Session, UserMessage } from '../../services/chat/types.js'
import styles from './MessageAnchorNav.module.css'

/** 锚点导航卡片（FR-5）距离内容区右侧与底部的悬浮间距 */
const CARD_OFFSET_RIGHT = 12
const CARD_OFFSET_BOTTOM = 120
/** 判定「视区中线之上最近的一条提问」为激活项的中线系数 */
const ACTIVE_LINE_RATIO = 0.4

/**
 * 会话内快速跳转导航（FR-5）：用户提问 ≥2 条时，内容区右侧悬浮锚点卡片。
 * 每个锚点对应一条用户提问（摘要截断 + 状态指示条）；点击平滑滚动定位；
 * 滚动过程中按视区位置自动高亮当前对应提问，到底部高亮最后一项。
 * 纯前端行为，不写 store 持久化、不产生网络请求；列表由会话状态派生，
 * 会话切换、消息增减、重渲染后自动更新，不满足条件自动隐藏。
 */
export const MessageAnchorNav = ({
  session,
  scrollElement,
}: {
  session: Session
  /** 消息列表的滚动容器；null 表示尚未挂载 */
  scrollElement: HTMLElement | null
}) => {
  const isMobile = useIsMobile()
  const anchors = useMemo(
    () =>
      getVisibleMessages(session)
        .filter((message): message is UserMessage => message.role === 'user')
        .filter((message) => message.content.trim() !== '')
        .map((message) => ({ id: message.id, text: message.content })),
    [session]
  )
  const [activeId, setActiveId] = useState<string | null>(null)
  const scrollingRef = useRef(false)

  const visible = !isMobile && anchors.length >= 2 && scrollElement !== null

  // 滚动跟随：scroll + rAF 节流，取视区中线之上最近的一条提问；到底部强制激活最后一项
  useEffect(() => {
    const scroll = scrollElement
    if (!visible || !scroll) {
      return
    }
    let frame: number | undefined
    const computeActive = () => {
      frame = undefined
      const line = scroll.getBoundingClientRect().top + scroll.clientHeight * ACTIVE_LINE_RATIO
      let current: string | null = null
      for (const anchor of anchors) {
        const el = scroll.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(anchor.id)}"]`)
        if (el && el.getBoundingClientRect().top <= line) {
          current = anchor.id
        }
      }
      const atBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 40
      setActiveId(atBottom ? anchors[anchors.length - 1].id : (current ?? anchors[0].id))
    }
    const onScroll = () => {
      if (frame === undefined) {
        frame = requestAnimationFrame(computeActive)
      }
    }
    scroll.addEventListener('scroll', onScroll, { passive: true })
    computeActive()
    return () => {
      scroll.removeEventListener('scroll', onScroll)
      if (frame !== undefined) {
        cancelAnimationFrame(frame)
      }
    }
  }, [visible, scrollElement, anchors])

  if (!visible) {
    return null
  }

  const jump = (messageId: string) => {
    const scroll = scrollElement
    if (!scroll) {
      return
    }
    const target = scroll.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(messageId)}"]`)
    if (!target) {
      return
    }
    scrollingRef.current = true
    const scrollRect = scroll.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    const top = scroll.scrollTop + (targetRect.top - scrollRect.top) - 24
    const reduceMotion =
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!reduceMotion && typeof scroll.scrollTo === 'function') {
      scroll.scrollTo({ top, behavior: 'smooth' })
    } else {
      scroll.scrollTop = top
    }
    // 平滑滚动结束后由 scroll 监听恢复常规激活跟踪
    setTimeout(() => {
      scrollingRef.current = false
    }, 800)
  }

  return (
    <nav
      className={styles.card}
      aria-label={session.title || undefined}
      style={{ right: CARD_OFFSET_RIGHT, bottom: CARD_OFFSET_BOTTOM }}
    >
      <ol className={styles.list}>
        {anchors.map((anchor, index) => (
          <li key={anchor.id} className={styles.item}>
            <button
              type="button"
              className={styles.anchor}
              aria-current={anchor.id === activeId ? 'true' : undefined}
              onClick={() => jump(anchor.id)}
            >
              <span className={styles.label}>{anchor.text}</span>
              <span
                className={styles.indicator}
                data-active={anchor.id === activeId || undefined}
              />
            </button>
            {index < anchors.length - 1 ? <span className={styles.divider} /> : null}
          </li>
        ))}
      </ol>
    </nav>
  )
}
