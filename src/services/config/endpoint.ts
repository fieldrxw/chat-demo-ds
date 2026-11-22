import { create } from 'zustand'
import { __API_ORIGIN__ } from './origin.js'

/**
 * 端点/模型配置解析（FR-1/FR-2）。
 * 三层来源逐字段回退：界面配置 > 部署级默认（config.js）> 官方默认（构建期注入）。
 * 界面配置存独立 key `chat-demo:endpoint`，不改动既有 localStorage 结构。
 */

export type EndpointSource = 'ui' | 'deployment' | 'official'

export type EndpointConfig = {
  /** 验证地址（网关基础地址，应用自动拼接 /models） */
  verifyOrigin?: string
  /** 聊天地址（网关基础地址）；留空时与验证地址相同 */
  chatOrigin?: string
  /** 聊天请求使用的模型；留空使用应用默认模型 */
  model?: string
}

export type ResolvedEndpoint = {
  /** 验证地址（已去尾部斜杠） */
  verifyOrigin: string
  /** 聊天地址（已去尾部斜杠） */
  chatOrigin: string
  /** null 表示使用应用默认模型 */
  model: string | null
  verifySource: EndpointSource
  chatSource: EndpointSource
  modelSource: EndpointSource
}

/** 端点配置的 localStorage key（新增，独立于既有 key） */
export const ENDPOINT_STORAGE_KEY = 'chat-demo:endpoint'

/** 官方默认地址（与 rspack.config.ts 的 apiOrigin 一致） */
export const OFFICIAL_ORIGIN = __API_ORIGIN__

const trimSlashes = (value: string | undefined | null): string => {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim().replace(/\/+$/, '')
}

const nonEmpty = (value: string): value is string => value.length > 0

const readLocalStorage = (): Partial<Record<keyof EndpointConfig, string>> => {
  try {
    const raw = localStorage.getItem(ENDPOINT_STORAGE_KEY)
    if (!raw) {
      return {}
    }
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) {
      return {}
    }
    const value = parsed as Record<string, unknown>
    const pick = (key: string) => (typeof value[key] === 'string' ? (value[key] as string) : '')
    return {
      verifyOrigin: trimSlashes(pick('verifyOrigin')),
      chatOrigin: trimSlashes(pick('chatOrigin')),
      model: pick('model').trim(),
    }
  } catch {
    return {}
  }
}

/** config.js 通过 window.ChatDemoDeploymentConfig 提供部署级默认；缺文件/缺字段静默跳过 */
const readDeploymentConfig = (): Partial<Record<keyof EndpointConfig, string>> => {
  try {
    const raw: unknown = (globalThis as { ChatDemoDeploymentConfig?: unknown })
      .ChatDemoDeploymentConfig
    if (typeof raw !== 'object' || raw === null) {
      return {}
    }
    const value = raw as Record<string, unknown>
    const pick = (key: string) => (typeof value[key] === 'string' ? (value[key] as string) : '')
    return {
      verifyOrigin: trimSlashes(pick('verifyOrigin')),
      chatOrigin: trimSlashes(pick('chatOrigin')),
      model: pick('model').trim(),
    }
  } catch {
    return {}
  }
}

type FieldSource<T> = { value: T; source: EndpointSource }

/**
 * 逐字段解析：界面 > 部署 > 官方。
 * 地址类字段官方层恒为非空字符串（__API_ORIGIN__），模型官方层为 null。
 */
const pickField = (
  ui: string | undefined,
  deployment: string | undefined,
  official: string | null
): FieldSource<string | null> => {
  if (ui && nonEmpty(ui)) {
    return { value: ui, source: 'ui' }
  }
  if (deployment && nonEmpty(deployment)) {
    return { value: deployment, source: 'deployment' }
  }
  return { value: official, source: 'official' }
}

/** 解析当前生效的端点与模型配置；任何一层缺失或非法都静默回退，绝不抛错 */
export const resolveEndpoint = (): ResolvedEndpoint => {
  const ui = readLocalStorage()
  const deployment = readDeploymentConfig()
  const verify = pickField(ui.verifyOrigin, deployment.verifyOrigin, OFFICIAL_ORIGIN)
  const chat = pickField(ui.chatOrigin, deployment.chatOrigin, null)
  const model = pickField(ui.model, deployment.model, null)
  // 聊天地址留空时与验证地址相同（来源跟随验证地址）；官方验证地址下聊天恒为官方默认
  const chatValue = chat.value ?? verify.value ?? ''
  return {
    verifyOrigin: verify.value ?? '',
    chatOrigin: chatValue,
    model: model.value,
    verifySource: verify.source,
    chatSource: chat.value ? chat.source : verify.source,
    modelSource: model.source,
  }
}

/** 聊天请求使用的模型；null 回退应用默认 deepseek-flash（由调用方兜底） */
export const resolvedModel = (): string | null => resolveEndpoint().model

type EndpointUiState = {
  /** 渲染面板用的快照；保存/清除后随刷新重建 */
  resolved: ResolvedEndpoint
}

export const useEndpointConfig = create<EndpointUiState>(() => ({
  resolved: resolveEndpoint(),
}))

export const refreshEndpointConfig = () =>
  useEndpointConfig.setState({ resolved: resolveEndpoint() })

/** 保存界面配置（仅写界面层；空字段按未配置处理），立即生效 */
export const saveEndpointConfig = (config: EndpointConfig) => {
  const value: EndpointConfig = {}
  const verifyOrigin = trimSlashes(config.verifyOrigin)
  const chatOrigin = trimSlashes(config.chatOrigin)
  const model = typeof config.model === 'string' ? config.model.trim() : ''
  if (verifyOrigin) {
    value.verifyOrigin = verifyOrigin
  }
  if (chatOrigin) {
    value.chatOrigin = chatOrigin
  }
  if (model) {
    value.model = model
  }
  try {
    if (Object.keys(value).length === 0) {
      localStorage.removeItem(ENDPOINT_STORAGE_KEY)
    } else {
      localStorage.setItem(ENDPOINT_STORAGE_KEY, JSON.stringify(value))
    }
  } catch {
    // 存储不可用时只在内存中生效
  }
  refreshEndpointConfig()
}

/** 清除界面配置，回退部署级默认或官方默认 */
export const clearEndpointConfig = () => {
  try {
    localStorage.removeItem(ENDPOINT_STORAGE_KEY)
  } catch {
    // 存储不可用时忽略
  }
  refreshEndpointConfig()
}
