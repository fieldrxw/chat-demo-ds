/**
 * 部署级默认端点配置（FR-1）。
 * 页面加载时读取（index.html 以 defer 引入，构建时复制到 dist/config.js）。
 * 部署者替换 dist 目录中的本文件即可预置默认端点，终端用户无需配置即可使用。
 *
 * 优先级：界面配置 > 本文件（部署默认）> 官方默认（https://api.deepseek.com）。
 * 字段留空（''）或不写该字段 = 未配置，按下一层处理；地址填写网关基础地址（末尾多余斜杠自动去除）。
 * - verifyOrigin：验证地址（模型列表接口 GET {verifyOrigin}/models）
 * - chatOrigin：聊天地址（流式聊天 POST {chatOrigin}/anthropic/v1/messages）；留空时与验证地址相同
 * - model：聊天请求使用的模型；留空使用应用默认模型 deepseek-flash
 */
window.ChatDemoDeploymentConfig = {
  verifyOrigin: '',
  chatOrigin: '',
  model: '',
}
