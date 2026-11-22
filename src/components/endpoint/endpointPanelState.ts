import { create } from 'zustand'

/** 端点配置面板开关（FR-1）；保存/清除后由 location.reload() 整页刷新生效 */
type EndpointPanelState = {
  open: boolean
}

export const useEndpointPanel = create<EndpointPanelState>(() => ({ open: false }))

export const openEndpointPanel = () => useEndpointPanel.setState({ open: true })
export const closeEndpointPanel = () => useEndpointPanel.setState({ open: false })
