import { getVisibleMessages } from './branches.js'
import * as db from './db.js'
import type { ReplyBlock, Session, SessionSummary } from './types.js'

/**
 * 会话全文检索（FR-3）：范围 = 全部会话的标题与消息内容（用户消息 content、助手回复文本块）。
 * 纯本地：只读 IndexedDB 现有存储（sessionSummaries + sessions），不建索引、不加表、不发起网络请求。
 */

export type ChatSearchHit = {
  sessionId: string
  /** 会话标题（不含命中片段） */
  sessionTitle: string
  /** 命中的消息 id；null = 仅标题命中 */
  messageId: string | null
  /** 会话最近更新时间，用于排序 */
  updatedAt: number
  /** 命中上下文片段（标题命中为会话标题本身） */
  snippet: string
  /** 片段内命中的关键词（原文形式，供 UI 高亮） */
  terms: string[]
}

/** 片段窗口：以命中位置为中心各保留的字符数 */
const SNIPPET_CONTEXT = 60
/** 片段最大长度 */
const SNIPPET_MAX = 160

/** 解析查询：空白分隔多关键词（AND），全部命中才匹配；不区分大小写。 */
export const parseSearchQuery = (rawQuery: string): string[] => [
  ...new Set(rawQuery.trim().toLowerCase().split(/\s+/).filter(Boolean)),
]

const messageText = (session: Session): { id: string; text: string }[] => {
  const parts: { id: string; text: string }[] = []
  for (const message of getVisibleMessages(session)) {
    if (message.role === 'user') {
      if (message.content) {
        parts.push({ id: message.id, text: message.content })
      }
    } else {
      const text = message.blocks
        .filter((block): block is Extract<ReplyBlock, { type: 'text' }> => block.type === 'text')
        .filter((block) => block.text.trim())
        .map((block) => block.text)
        .join('\n')
      if (text) {
        parts.push({ id: message.id, text })
      }
    }
  }
  return parts
}

/** 大小写不敏感地找出文本中全部关键词的命中位置（返回原文形式的命中的词） */
const findMatches = (
  text: string,
  terms: string[]
): { index: number; length: number; term: string }[] => {
  const lower = text.toLowerCase()
  const matches: { index: number; length: number; term: string }[] = []
  for (const term of terms) {
    const needle = term.toLowerCase()
    let from = 0
    for (;;) {
      const index = lower.indexOf(needle, from)
      if (index === -1) {
        break
      }
      matches.push({ index, length: needle.length, term: text.slice(index, index + needle.length) })
      from = index + needle.length
    }
  }
  return matches.sort((a, b) => a.index - b.index)
}

/** 以首个命中为中心截取上下文片段（原文），多关键词命中点尽量纳入 */
const buildSnippet = (text: string, matches: { index: number; length: number }[]): string => {
  const first = matches[0]
  const last = matches[matches.length - 1]
  let start = Math.max(0, first.index - SNIPPET_CONTEXT)
  let end = Math.min(text.length, last.index + last.length + SNIPPET_CONTEXT)
  if (end - start > SNIPPET_MAX) {
    // 以首个命中为锚，向后再收窄，保证首个命中不被截掉
    start = Math.max(0, Math.min(start, end - SNIPPET_MAX))
    end = Math.min(text.length, start + SNIPPET_MAX)
  }
  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''
  return `${prefix}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${suffix}`
}

const hitFromMessage = (
  session: SessionSummary,
  messageId: string,
  text: string,
  terms: string[]
): ChatSearchHit | null => {
  // 多关键词 AND：每个关键词都要在文本中命中（FR-3）
  const all = terms.map((term) => findMatches(text, [term]))
  if (all.some((matches) => matches.length === 0)) {
    return null
  }
  const matches = all.flat().sort((a, b) => a.index - b.index)
  return {
    sessionId: session.id,
    sessionTitle: summaryTitle(session),
    messageId,
    updatedAt: session.updatedAt,
    snippet: buildSnippet(text, matches),
    terms: [...new Set(matches.map((match) => match.term))],
  }
}

const summaryTitle = (summary: SessionSummary): string => summary.title || ''

/** 仅标题命中（AND）；标题命中不做消息定位（FR-4） */
const titleHit = (summary: SessionSummary, terms: string[]): ChatSearchHit | null => {
  const all = terms.map((term) => findMatches(summary.title, [term]))
  if (all.some((matches) => matches.length === 0)) {
    return null
  }
  const matches = all.flat()
  return {
    sessionId: summary.id,
    sessionTitle: summaryTitle(summary),
    messageId: null,
    updatedAt: summary.updatedAt,
    snippet: summary.title,
    terms: [...new Set(matches.map((match) => match.term))],
  }
}

const searchSession = (
  session: Session,
  summary: SessionSummary,
  terms: string[]
): ChatSearchHit[] => {
  const hits: ChatSearchHit[] = []
  for (const { id, text } of messageText(session)) {
    const hit = hitFromMessage(session, id, text, terms)
    if (hit) {
      hits.push(hit)
    }
  }
  // 消息内容都没命中且标题命中：只开定位到会话，不做消息定位（FR-4）
  if (hits.length === 0) {
    const hit = titleHit(summary, terms)
    if (hit) {
      hits.push(hit)
    }
  }
  return hits
}

/**
 * 跨会话全文检索。任一存储读取失败都按空结果降级，不抛错（FR-3 边界：存储异常给空态不中断）。
 * 结果按会话 updatedAt 降序，同会话多条按消息出现顺序（澄清第 4 条：多处命中分条列出）。
 */
export const searchChatSessions = async (rawQuery: string): Promise<ChatSearchHit[]> => {
  const terms = parseSearchQuery(rawQuery)
  if (terms.length === 0) {
    return []
  }
  try {
    const summaries = await db.loadSessionSummaries()
    const hits: ChatSearchHit[] = []
    for (const summary of summaries) {
      // 标题命中也要列出（范围含标题）；详情读取失败时仅按标题匹配
      let session: Session | undefined
      try {
        session = await db.loadSession(summary.id)
      } catch {
        session = undefined
      }
      if (session) {
        hits.push(...searchSession(session, summary, terms))
      } else {
        const hit = titleHit(summary, terms)
        if (hit) {
          hits.push(hit)
        }
      }
    }
    return hits.sort((a, b) => b.updatedAt - a.updatedAt || a.sessionId.localeCompare(b.sessionId))
  } catch {
    return []
  }
}
