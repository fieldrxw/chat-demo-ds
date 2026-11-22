import { create } from 'zustand'

/** 会话全文检索面板开关（FR-3）；Esc / 点外部关闭，点击结果定位后关闭 */
type ChatSearchState = {
  open: boolean
}

export const useChatSearch = create<ChatSearchState>(() => ({ open: false }))

export const openChatSearch = () => useChatSearch.setState({ open: true })
export const closeChatSearch = () => useChatSearch.setState({ open: false })
