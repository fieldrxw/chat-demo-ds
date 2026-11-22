# chat-demo

[English](README.md) | 简体中文

基于 DeepSeek API 的静态聊天示例。无需应用后端，浏览器直接请求配置的 API 服务。

点击 [在线体验](https://deepseek-ai.github.io/chat-demo/) 即可使用，也可以前往 [Releases](https://github.com/deepseek-ai/deepseek-chat-demo/releases) 下载压缩包，解压后双击 `index.html` 在本地使用，无需安装或构建。首次使用时，请在设置中填写 API Key。

## 运行

准备 Node.js 22.12+ 和 pnpm：

```sh
git clone https://github.com/deepseek-ai/chat-demo.git
cd chat-demo
pnpm install
pnpm dev
```

打开 http://localhost:8090 。

生成静态产物：

```sh
pnpm build
```

产物位于 `dist/`，可部署到静态服务器，也可直接打开 `dist/index.html`。直接打开时，浏览器和 API 服务需允许 `file://` 页面的存储与跨域请求。

## 自定义端点与本地代理

页面默认连接官方地址，也可以对接任何提供 Anthropic Messages 协议路由的第三方兼容网关：

- **界面配置**：页面右下角的悬浮齿轮按钮打开「端点配置」面板，可填写验证地址（模型列表接口 `GET {验证地址}/models`）、聊天地址（流式聊天 `POST {聊天地址}/anthropic/v1/messages`，留空与验证地址相同）和模型名（留空使用 `deepseek-flash`；打开面板时会尝试拉取模型列表作下拉提示，拉取失败不影响手填）。地址填写网关基础地址，末尾多余斜杠自动去除；「保存并刷新」立即生效，「清除界面配置」回退部署默认或官方默认。
- **部署级默认**：构建时 `config.js` 会复制到 `dist/config.js`（页面以 `defer` 引入）。部署者替换该文件即可预置默认端点，终端用户无需配置：

  ```js
  window.ChatDemoDeploymentConfig = {
    verifyOrigin: 'https://gateway.example.com',
    chatOrigin: '', // 留空与验证地址相同
    model: '',
  }
  ```

  配置优先级：界面配置 > `config.js` 部署默认 > 官方默认（`https://api.deepseek.com`）。

第三方服务未开放跨域（CORS）时，使用仓库根目录的零依赖代理脚本，让页面与接口同源：

```sh
node proxy.mjs --dir dist --port 8080                # 托管 dist 并转发到官方上游
node proxy.mjs --dir dist --upstream https://gateway.example.com
node proxy.mjs --upstream https://gateway.example.com  # 纯转发模式，可搭配任意静态服务器
```

上游为 HTTPS、本地监听 HTTP；代理为上游响应补齐跨域头并短路预检请求，流式（SSE）响应逐 chunk 直通。参数也可用环境变量 `PROXY_UPSTREAM` / `PROXY_DIR` / `PROXY_PORT` 指定。聊天需第三方端点支持 Anthropic Messages 流式协议；纯 OpenAI 协议端点不在支持范围。

## 功能

- 多会话、自动标题、重命名与删除；编辑提问、重新生成和切换消息分支。
- 流式回答、深度思考、智能搜索、链接阅读与来源引用；支持停止和符合条件的继续生成。
- 附件上传、粘贴与拖拽，语音输入和回复朗读；移动端录音时输入框首行显示实时频谱。
- Markdown、代码高亮、KaTeX 公式和 Mermaid 图表。
- 简体中文与英文、浅色与深色主题、移动端布局、位置设置、历史导入导出。

## 数据

API Key 和设置保存在浏览器 localStorage，会话及附件原件保存在 IndexedDB，本地数据按浏览器用户配置和站点源（origin）隔离。发送对话、上传附件和使用语音功能时，相应内容会提交给配置的 API 服务。

设置中的历史导入导出使用 ZIP 格式。导入会在确认并校验成功后替换全部本地会话和附件；导出包含会话与本地可用的图片原件，不包含 API Key、设置或非图片附件原件。格式与保留范围见[历史导入导出](src/services/chat/history/README.md)。

设置 → 数据管理 → 删除所有对话，会在确认后清空全部本地会话、附件原件和未发送的草稿，停止正在生成的回复并回到新对话。API Key 和其他设置保留，已上传到 API 服务的文件不受影响。

## 开发

| 命令          | 用途                |
| ------------- | ------------------- |
| `pnpm dev`    | 启动开发服务器      |
| `pnpm build`  | 构建到 `dist/`      |
| `pnpm type`   | TypeScript 类型检查 |
| `pnpm lint`   | oxlint 检查         |
| `pnpm format` | oxfmt 格式化        |

[rspack.config.ts](rspack.config.ts) 默认连接 `https://api.deepseek.com`。`createConfig({ apiOrigin, devServer })` 支持自定义 API 地址和开发服务器代理。

聊天默认使用 `deepseek-flash`，通过 Anthropic 兼容的 Messages / Files API 通信；语音使用 ASR / TTS 接口。请求使用搜索、链接阅读、标题和 `latest_reminder` 等扩展，接入服务需支持相应能力。附件实际支持的格式以服务端校验为准。

```text
src/
  app/                 应用布局、主题与全局样式
  components/          聊天、设置、Markdown 等界面组件
  i18n/                中英文文案
  services/
    api/               API 请求、SSE 与协议类型
    chat/              会话、消息分支、本地存储与历史导入导出
    markdown/          Markdown 解析、代码高亮与图表
    speech/            录音与朗读
  utils/               通用工具
```

## 许可证

[MIT](LICENSE)。构建会将许可证复制到 `dist/LICENSE`，分发时请一并保留；第三方依赖遵循各自的许可证。
