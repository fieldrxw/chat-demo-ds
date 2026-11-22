import { useTranslate } from '../../i18n/index.js'
import { useEndpointPanel } from './endpointPanelState.js'
import styles from './EndpointButton.module.css'

/**
 * 端点配置入口（FR-1）：右下角悬浮按钮。
 * 桌面与移动端均显示，避开输入框与锚点导航卡片；位于页面层，不随消息列表重渲染消失。
 */
export const EndpointButton = () => {
  const t = useTranslate()
  const open = useEndpointPanel((state) => state.open)
  if (open) {
    return null
  }
  return (
    <button
      type="button"
      className={styles.button}
      aria-label={t('endpointConfigTooltip')}
      title={t('endpointConfigTooltip')}
      onClick={() => useEndpointPanel.setState({ open: true })}
    >
      <svg
        width={18}
        height={18}
        viewBox="0 0 16 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M8 1.4C6.9 1.4 6 2.3 6 3.4V3.9C5.7 4 5.4 4.2 5.1 4.4L4.7 4.1C3.9 3.6 2.8 3.8 2.3 4.6C1.8 5.4 2 6.5 2.8 7L3.1 7.2C3.1 7.4 3.1 7.7 3.1 8C3.1 8.3 3.1 8.6 3.1 8.8L2.8 9C2 9.5 1.8 10.6 2.3 11.4C2.8 12.2 3.9 12.4 4.7 11.9L5.1 11.6C5.4 11.8 5.7 12 6 12.1V12.6C6 13.7 6.9 14.6 8 14.6C9.1 14.6 10 13.7 10 12.6V12.1C10.3 12 10.6 11.8 10.9 11.6L11.3 11.9C12.1 12.4 13.2 12.2 13.7 11.4C14.2 10.6 14 9.5 13.2 9L12.9 8.8C12.9 8.6 12.9 8.3 12.9 8C12.9 7.7 12.9 7.4 12.9 7.2L13.2 7C14 6.5 14.2 5.4 13.7 4.6C13.2 3.8 12.1 3.6 11.3 4.1L10.9 4.4C10.6 4.2 10.3 4 10 3.9V3.4C10 2.3 9.1 1.4 8 1.4Z"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <circle cx="8" cy="8" r="2" fill="currentColor" />
      </svg>
    </button>
  )
}
