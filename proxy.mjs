#!/usr/bin/env node
/**
 * 本地代理 / 静态托管脚本（FR-6）。零依赖，仅用 Node 内置模块。
 *
 * 用法：
 *   node proxy.mjs [--upstream URL] [--dir DIR] [--port N]
 *   环境变量 PROXY_UPSTREAM / PROXY_DIR / PROXY_PORT 同义，命令行参数优先。
 *
 * - 反向代理：把请求按前缀透传到上游（上游可为 HTTPS，本地监听 HTTP），
 *   为上游响应补齐跨域响应头（Access-Control-Allow-Origin 等），预检 OPTIONS 直接 204 短路。
 * - 流式直通：SSE（text/event-stream）等响应以原始管道逐 chunk 转发，不缓冲、不转码。
 * - 静态托管：给定 --dir 时优先匹配本地文件（如构建产物 dist/），未命中回落上游代理，
 *   使页面与接口同源，从根本上避免跨域预检请求。
 * - 纯转发模式：不指定 --dir 时仅做代理转发，可配合任意静态服务器使用。
 *
 * 默认：--port 8080；--upstream https://api.deepseek.com
 */

import http from 'node:http'
import https from 'node:https'
import { createReadStream, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { URL } from 'node:url'

/** 解析命令行参数与环境变量，命令行参数优先 */
const parseArgs = (argv) => {
  const args = { upstream: null, dir: null, port: null }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    const take = () => {
      index += 1
      return argv[index]
    }
    if (value === '--upstream') {
      args.upstream = take()
    } else if (value === '--dir') {
      args.dir = take()
    } else if (value === '--port') {
      args.port = take()
    } else {
      console.error(`未知参数：${value}`)
      process.exitCode = 1
    }
  }
  return {
    upstream: process.env.PROXY_UPSTREAM ?? args.upstream,
    dir: process.env.PROXY_DIR ?? args.dir,
    port: Number(process.env.PROXY_PORT ?? args.port ?? 8080),
  }
}

/** 最小 MIME 表：托管静态页面目录够用 */
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
}

const send = (res, status, headers, body) => {
  res.writeHead(status, { ...CORS_HEADERS, ...headers })
  res.end(body)
}

/** 上游为 HTTPS、本地监听 HTTP；请求体原样透传，响应流式直通 */
const proxyRequest = (upstream, req, res) => {
  const target = new URL(upstream)
  const transport = target.protocol === 'https:' ? https : http
  const headers = { ...req.headers }
  delete headers.host
  delete headers.connection
  const proxied = transport.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (target.protocol === 'https:' ? 443 : 80),
      method: req.method,
      path: req.url,
      headers,
    },
    (upstreamRes) => {
      const responseHeaders = {
        // 原样透传响应头（含 Content-Type、SSE 相关），再补跨域头
        ...upstreamRes.headers,
        ...CORS_HEADERS,
        'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] ?? '*',
      }
      res.writeHead(upstreamRes.statusCode ?? 502, responseHeaders)
      // 流式直通：不缓冲，逐 chunk 转发（SSE 依赖 chunked 边界）
      upstreamRes.pipe(res)
    }
  )
  proxied.on('error', (error) => {
    if (!res.headersSent) {
      send(
        res,
        502,
        { 'Content-Type': 'text/plain; charset=utf-8' },
        `上游连接失败: ${error.message}`
      )
    } else {
      res.end()
    }
  })
  req.pipe(proxied)
}

/** 静态文件：目录优先回退 index.html（SPA 场景），其余 404 */
const serveStatic = (dir, urlPath, res) => {
  const safePath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '')
  let filePath = path.join(dir, safePath)
  if (!filePath.startsWith(path.resolve(dir))) {
    send(res, 403, {}, 'Forbidden')
    return true
  }
  let stat
  try {
    stat = existsSync(filePath) ? statSync(filePath) : null
  } catch {
    // existsSync 与 stat 之间文件被删除/变更（TOCTOU）：按未命中处理，回落上游代理
    stat = null
  }
  if (stat?.isDirectory()) {
    filePath = path.join(filePath, 'index.html')
    try {
      stat = statSync(filePath)
    } catch {
      stat = null
    }
  }
  if (!stat?.isFile()) {
    return false
  }
  const ext = path.extname(filePath).toLowerCase()
  const stream = createReadStream(filePath)
  stream.on('open', () => {
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    })
    stream.pipe(res)
  })
  stream.on('error', () => {
    if (!res.headersSent) {
      send(res, 500, {}, '读取文件失败')
    }
  })
  return true
}

const main = () => {
  const { upstream, dir, port } = parseArgs(process.argv.slice(2))
  const staticDir = dir ? path.resolve(dir) : null
  if (staticDir && !existsSync(staticDir)) {
    console.error(`静态目录不存在：${staticDir}`)
    process.exitCode = 1
    return
  }
  const server = http.createServer((req, res) => {
    // 预检请求直接短路，为上游补齐跨域响应头
    if (req.method === 'OPTIONS') {
      send(res, 204, {
        'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] ?? '*',
        'Access-Control-Max-Age': '600',
      })
      return
    }
    if (staticDir) {
      const urlPath = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname)
      if (serveStatic(staticDir, urlPath, res)) {
        return
      }
      // 未命中本地文件回落上游代理：页面与接口同源
    }
    if (!upstream) {
      send(
        res,
        404,
        { 'Content-Type': 'text/plain; charset=utf-8' },
        '未配置上游地址（--upstream）且无静态文件'
      )
      return
    }
    proxyRequest(upstream, req, res)
  })
  server.on('clientError', (_error, socket) => socket.end('HTTP/1.1 400 Bad Request\r\n\r\n'))
  server.listen(port, () => {
    console.log(`[proxy] listening on http://localhost:${port}`)
    console.log(`[proxy] upstream: ${upstream ?? '(未配置)'}`)
    console.log(`[proxy] static dir: ${staticDir ?? '(纯转发模式)'}`)
  })
}

main()
