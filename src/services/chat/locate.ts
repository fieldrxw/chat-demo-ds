import { create } from 'zustand'

/**
 * 搜索结果定位（FR-4）：点击结果后「打开会话并定位到命中消息」的待处理目标。
 * MessageList 在会话加载并渲染后消费该目标；纯前端内存态，不落盘。
 */
type PendingLocate = {
  sessionId: string
  /** null = 仅标题命中，只打开会话 */
  messageId: string | null
}

type LocateState = {
  pending: PendingLocate | null
}

export const useLocate = create<LocateState>(() => ({ pending: null }))

/** 请求定位；messageId 为 null 时仅表示「打开该会话」 */
export const requestLocate = (sessionId: string, messageId: string | null) =>
  useLocate.setState({ pending: { sessionId, messageId } })

/** 目标已消费（或会话切换作废）后清空；不传 sessionId 时仅清除不属于指定会话的目标 */
export const consumeLocate = (sessionId?: string) =>
  useLocate.setState((state) =>
    state.pending && (sessionId === undefined || state.pending.sessionId === sessionId)
      ? { pending: null }
      : state
  )

/** 会话切换时作废不属于新会话的定位目标（FR-4）；不破坏正在等待挂载的目标 */
export const invalidateLocateExcept = (sessionId: string | null) =>
  useLocate.setState((state) =>
    state.pending && state.pending.sessionId !== sessionId ? { pending: null } : state
  )
