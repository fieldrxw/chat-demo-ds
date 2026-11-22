import { useEffect, useRef, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { request } from '../../services/api/client.js'
import {
  OFFICIAL_ORIGIN,
  clearEndpointConfig,
  saveEndpointConfig,
  useEndpointConfig,
  type EndpointSource,
} from '../../services/config/endpoint.js'
import { useSettings } from '../../services/settings.js'
import { Button } from '../base/Button.js'
import { Modal } from '../base/Modal.js'
import { closeEndpointPanel } from './endpointPanelState.js'
import styles from './EndpointPanel.module.css'

/** 严格类型守卫解析 GET /models 的 { data: [{ id }] }；任何异常按列表不可用降级（风险 4） */
const readModelIds = (body: unknown): string[] => {
  if (typeof body !== 'object' || body === null || !('data' in body)) {
    return []
  }
  const data = (body as { data: unknown }).data
  if (!Array.isArray(data)) {
    return []
  }
  return data
    .map((item) =>
      typeof item === 'object' && item !== null && 'id' in item
        ? (item as { id: unknown }).id
        : null
    )
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
}

type ModelsState =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'done'; models: string[] }

const sourceLabel = (source: EndpointSource, t: ReturnType<typeof useTranslate>): string =>
  source === 'ui'
    ? t('endpointSourceUi')
    : source === 'deployment'
      ? t('endpointSourceDeployment')
      : t('endpointSourceOfficial')

const EffectiveRow = ({
  label,
  value,
  source,
}: {
  label: string
  value: string
  source: EndpointSource
}) => {
  const t = useTranslate()
  return (
    <div className={styles.effectiveRow}>
      <span className={styles.effectiveLabel}>{label}</span>
      <span className={styles.effectiveValue} title={value}>
        {value}
      </span>
      <span className={styles.sourceBadge}>{sourceLabel(source, t)}</span>
    </div>
  )
}

/**
 * 端点配置面板（FR-1/FR-2）：验证地址、聊天地址、模型名三字段。
 * 「保存并刷新」写入界面配置并整页刷新立即生效；「清除界面配置」回退部署默认/官方默认。
 * 打开时尝试从网关拉取模型列表作下拉提示，失败仅提示、不影响手填。
 */
export const EndpointPanel = () => {
  const t = useTranslate()
  const resolved = useEndpointConfig((state) => state.resolved)
  const apiKey = useSettings((state) => state.apiKey)
  const [verifyOrigin, setVerifyOrigin] = useState('')
  const [chatOrigin, setChatOrigin] = useState('')
  const [model, setModel] = useState(resolved.model ?? '')
  const [models, setModels] = useState<ModelsState>({ status: 'loading' })
  const requestIdRef = useRef(0)

  // 打开面板时拉取模型列表（Bearer 鉴权）；失败仅隐藏下拉，不阻塞手填
  useEffect(() => {
    const requestId = ++requestIdRef.current
    setModels({ status: 'loading' })
    request(`${resolved.verifyOrigin}/models`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey ?? ''}` },
    })
      .then(async (response) => {
        if (requestIdRef.current !== requestId) {
          return
        }
        const ids = readModelIds(await response.json().catch(() => null))
        setModels(ids.length > 0 ? { status: 'done', models: ids } : { status: 'failed' })
      })
      .catch(() => {
        if (requestIdRef.current === requestId) {
          setModels({ status: 'failed' })
        }
      })
    return () => {
      requestIdRef.current += 1
    }
  }, [resolved.verifyOrigin, apiKey])

  const save = () => {
    saveEndpointConfig({ verifyOrigin, chatOrigin, model })
    location.reload()
  }

  const clear = () => {
    clearEndpointConfig()
    location.reload()
  }

  const isOfficial = resolved.verifyOrigin === OFFICIAL_ORIGIN
  return (
    <Modal
      title={t('endpointConfig')}
      closable
      className={styles.panel}
      onClose={closeEndpointPanel}
    >
      <div className={styles.body}>
        <label className={styles.field}>
          <span className={styles.label}>{t('endpointVerifyOriginLabel')}</span>
          <input
            type="text"
            className={styles.input}
            value={verifyOrigin}
            placeholder={resolved.verifyOrigin}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setVerifyOrigin(event.target.value)}
          />
          <span className={styles.hint}>{t('endpointVerifyOriginHint')}</span>
        </label>
        <label className={styles.field}>
          <span className={styles.label}>{t('endpointChatOriginLabel')}</span>
          <input
            type="text"
            className={styles.input}
            value={chatOrigin}
            placeholder={resolved.chatOrigin}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setChatOrigin(event.target.value)}
          />
          <span className={styles.hint}>
            {isOfficial ? t('endpointOfficialChatAuto') : t('endpointChatOriginHint')}
          </span>
        </label>
        <label className={styles.field}>
          <span className={styles.label}>{t('endpointModelLabel')}</span>
          <input
            type="text"
            className={styles.input}
            value={model}
            placeholder={resolved.model ?? ''}
            spellCheck={false}
            autoComplete="off"
            list="endpoint-model-options"
            onChange={(event) => setModel(event.target.value)}
          />
          <datalist id="endpoint-model-options">
            {models.status === 'done'
              ? models.models.map((item) => <option key={item} value={item} />)
              : null}
          </datalist>
          <span className={styles.hint}>
            {models.status === 'loading'
              ? t('endpointModelLoading')
              : models.status === 'failed'
                ? t('endpointModelFetchFailed')
                : t('endpointModelHint')}
          </span>
        </label>
        <div className={styles.effective}>
          <div className={styles.effectiveTitle}>{t('endpointCurrentEffective')}</div>
          <EffectiveRow
            label={t('endpointVerifyOriginLabel')}
            value={resolved.verifyOrigin}
            source={resolved.verifySource}
          />
          <EffectiveRow
            label={t('endpointChatOriginLabel')}
            value={resolved.chatOrigin}
            source={resolved.chatSource}
          />
          <EffectiveRow
            label={t('endpointModelLabel')}
            value={resolved.model ?? ''}
            source={resolved.modelSource}
          />
        </div>
      </div>
      <div className={styles.actions}>
        <Button variant="outlined" onClick={clear}>
          {t('endpointClearUiConfig')}
        </Button>
        <Button onClick={save}>{t('endpointSaveAndReload')}</Button>
      </div>
    </Modal>
  )
}
