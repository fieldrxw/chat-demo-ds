# chat-demo

English | [简体中文](README.zh-CN.md)

A static chat demo powered by the DeepSeek API. No application backend is required: the browser connects directly to the configured API service.

You can [try the app online](https://deepseek-ai.github.io/chat-demo/) or download the archive from [Releases](https://github.com/deepseek-ai/deepseek-chat-demo/releases), extract it, and double-click `index.html` to use it locally without installation or a build. Enter your API key in Settings before your first chat.

## Getting started

Install Node.js 22.12+ and pnpm, then run:

```sh
git clone https://github.com/deepseek-ai/chat-demo.git
cd chat-demo
pnpm install
pnpm dev
```

Open http://localhost:8090.

To build the static site:

```sh
pnpm build
```

The output is written to `dist/`. Deploy it to a static web server or open `dist/index.html` directly. Opening the file directly requires browser support for storage on `file://` pages and an API service that permits their cross-origin requests.

## Custom endpoints and local proxy

By default the page talks to the official API, but it can also connect to any third-party compatible gateway that serves Anthropic Messages protocol routes:

- **UI configuration**: click the floating gear button at the bottom-right corner to open the endpoint panel. There you can fill in the verify origin (model list `GET {verify origin}/models`), the chat origin (streaming chat `POST {chat origin}/anthropic/v1/messages`; leave empty to reuse the verify origin), and the model name (empty falls back to `deepseek-flash`; the panel tries to fetch a model list as suggestions, and manual input works even if fetching fails). Enter gateway base URLs; trailing slashes are stripped automatically. "Save and reload" applies immediately; "Clear UI config" falls back to the deployment default or the official default.
- **Deployment-level defaults**: the build copies `config.js` to `dist/config.js` (loaded with `defer`). Deployers can replace that file to preconfigure endpoints so end users need no setup:

  ```js
  window.ChatDemoDeploymentConfig = {
    verifyOrigin: 'https://gateway.example.com',
    chatOrigin: '', // empty means same as verify origin
    model: '',
  }
  ```

  Priority: UI config > `config.js` deployment default > official default (`https://api.deepseek.com`).

When the third-party service does not allow cross-origin requests, use the zero-dependency proxy script in the repository root to serve the page and the API from the same origin:

```sh
node proxy.mjs --dir dist --port 8080                # host dist and forward to the official upstream
node proxy.mjs --dir dist --upstream https://gateway.example.com
node proxy.mjs --upstream https://gateway.example.com  # forwarding-only mode, works with any static server
```

The upstream is HTTPS while the local listener is HTTP. The proxy adds CORS headers to upstream responses and short-circuits preflight requests, and streaming (SSE) responses are piped through chunk by chunk. Options can also be set via `PROXY_UPSTREAM` / `PROXY_DIR` / `PROXY_PORT`. Chat requires the third-party endpoint to support the Anthropic Messages streaming protocol; OpenAI-protocol-only endpoints are out of scope.

## Features

- Multiple conversations with automatic titles, renaming, and deletion; edit prompts, regenerate replies, and switch between message branches.
- Streaming replies, deep thinking, smart search, link reading, and source citations; stop generation or continue eligible replies.
- Upload, paste, or drag and drop attachments; use voice input and read replies aloud. A live audio spectrum appears in the first row of the input area while recording on mobile.
- Markdown, syntax highlighting, KaTeX math, and Mermaid diagrams.
- Simplified Chinese and English, light and dark themes, mobile layouts, location settings, and chat history import and export.

## Data and storage

Your API key and settings are stored in the browser's localStorage. Conversations and original attachments are stored in IndexedDB. Local data is isolated by browser profile and site origin. Sending messages, uploading attachments, and using speech features sends the relevant content to the configured API service.

History import and export in Settings use ZIP archives. After confirmation and successful validation, importing replaces all local conversations and attachments. Exports include conversations and locally available original images, but exclude API keys, settings, and original non-image attachments. See the [history import/export documentation (Chinese)](src/services/chat/history/README.md) for the archive format and preservation details.

Settings → Data → Delete all chats clears all local conversations, original attachments, and unsent drafts after confirmation. It stops ongoing replies and returns to a new chat. Your API key and settings are preserved; files already uploaded to the API service are not deleted.

## Development

| Command       | Description                  |
| ------------- | ---------------------------- |
| `pnpm dev`    | Start the development server |
| `pnpm build`  | Build into `dist/`           |
| `pnpm type`   | Run TypeScript type checks   |
| `pnpm lint`   | Lint with oxlint             |
| `pnpm format` | Format with oxfmt            |

[rspack.config.ts](rspack.config.ts) uses `https://api.deepseek.com` by default. Use `createConfig({ apiOrigin, devServer })` to customize the API origin and development server proxy.

Chat uses `deepseek-flash` by default through Anthropic-compatible Messages / Files APIs. Speech features use ASR / TTS endpoints. Requests include extensions for search, link reading, titles, and `latest_reminder`, so the configured service must support the corresponding capabilities. Supported attachment formats are determined by server-side validation.

```text
src/
  app/                 Application layout, themes, and global styles
  components/          Chat, settings, Markdown, and other UI components
  i18n/                English and Chinese translations
  services/
    api/               API requests, SSE, and protocol types
    chat/              Conversations, message branches, storage, and history import/export
    markdown/          Markdown parsing, syntax highlighting, and diagrams
    speech/            Audio recording and read-aloud playback
  utils/               Shared utilities
```

## License

[MIT](LICENSE). The build copies the license to `dist/LICENSE`; include it when distributing the app. Third-party dependencies are subject to their own licenses.
