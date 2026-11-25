# Vercel Proxy Service

A simple HTTP proxy built with Vercel Serverless Functions. It helps bypass CORS restrictions and allows direct resource fetching.

## Features
- **Target URL spelling**  
  Both forms work, the second is recommended:
  - `/api/https://host/path` — reads naturally, but Vercel collapses `//` in the path and answers with `308` before the function runs, so you pay an extra hop and some clients refuse to replay a POST across a redirect.
  - `/api/https/host/path` — no `//`, no redirect. The malformed one-slash form (`/api/https:/host/path`) is repaired automatically.

- **`/api/`**  
  Full proxy interface for client-side scripts.  
  - Preserves the original HTTP method.
  - Preserves incoming end-to-end request headers. Hop-by-hop and runtime-managed headers such as `Host`, `Connection`, and `Content-Length` are excluded.
  - Replaces `Referer` with the target origin plus `/` and replaces `Origin` with the target origin.
  - Forwards request bodies for `POST`, `PUT`, `PATCH`, and `QUERY`, **rebuilt according to the original `Content-Type`**: form bodies stay `application/x-www-form-urlencoded` (never re-stringified as JSON), JSON stays JSON, and multipart / binary bodies are forwarded as raw bytes.
  - Forwards a `DELETE` body only when one is supplied; use it only when the target API explicitly supports it because HTTP defines no general semantics for `DELETE` content.
  - Does not attach request bodies to `GET` or `HEAD`.
  - Returns the response **byte for byte** — JSON is not re-serialized, so whitespace, key order and upstream `Content-Type` survive.
  - Adds CORS headers.
  - Size and media-type checks run against the actual response (no extra `HEAD` round trip).

- **`/fetch/`**  
  Direct proxy for browsers.  
  - Preserves end-to-end request headers and forges the target `Referer` and `Origin`.
  - Fetches target resources without extra parameters.  
  - Useful for images, audio, or other assets.

- **OPTIONS Handling**  
  Responds to CORS preflight requests with permissive headers, including support for `QUERY`.

## Usage
- Proxy API requests:  
  ```
  https://your-vercel-app.vercel.app/api/https/api.example.com/data.json
  ```
  (The classic `https://` inside the path still works but gets a `308` first.)
- Send an HTTP `QUERY` request with content:
  ```bash
  curl -X QUERY https://your-vercel-app.vercel.app/api/https/api.example.com/search \
    -H "Content-Type: application/json" \
    -d '{"query":"vercel proxy"}'
  ```
- Fetch resources directly:  
  ```
  https://your-vercel-app.vercel.app/fetch/https://example.com/image.png
  ```

## Deployment
- Place proxy handlers in the `api/` directory (`proxy.js`, `fetch.js`).  
- Configure `vercel.json` rewrites:
  ```json
  {
    "rewrites": [
      { "source": "/api/(.*)", "destination": "/api/proxy" },
      { "source": "/fetch/(.*)", "destination": "/api/fetch" }
    ]
  }
  ```

---

# Vercel 代理服务

一个基于 Vercel Serverless Functions 的轻量级 HTTP 代理，用于绕过 CORS 限制并直接获取外部资源。

## 功能
- **目标地址写法**  
  两种写法都可用，推荐第二种：
  - `/api/https://host/path`：直观，但路径里的 `//` 会被 Vercel 归一化，在函数执行前先回 `308`，多一跳；部分客户端不跟随 POST 重定向。
  - `/api/https/host/path`：路径里没有 `//`，不触发跳转。写坏的单斜杠形式（`/api/https:/host/path`）会被自动修复。

- **`/api/`**  
  面向客户端脚本的完整代理接口。  
  - 保留原始 HTTP 请求方法。
  - 保留客户端的端到端请求头；`Host`、`Connection`、`Content-Length` 等逐跳或运行时管理的请求头除外。
  - 将 `Referer` 替换为目标站点根地址，并将 `Origin` 替换为目标站点源。
  - 转发 `POST`、`PUT`、`PATCH` 和 `QUERY` 请求体，并**按原始 `Content-Type` 还原**：表单体仍是 `application/x-www-form-urlencoded`（不会被改写成 JSON 字符串），JSON 体保持 JSON，multipart / 二进制体按原始字节透传。
  - 仅在客户端提供时转发 `DELETE` 请求体；HTTP 没有为其定义通用语义，因此仅应在目标 API 明确支持时使用。
  - 不为 `GET` 或 `HEAD` 附加请求体。
  - 响应**逐字节透传**：不重新序列化 JSON，空白、字段顺序、上游 `Content-Type` 都保持原样。
  - 自动添加跨域许可头。
  - 大小与媒体类型检查基于实际响应（不再多发一次 HEAD）。

- **`/fetch/`**  
  面向浏览器的简化直链代理。  
  - 保留端到端请求头，并伪造目标站点的 `Referer` 和 `Origin`。
  - 无需额外参数，直接抓取目标资源。  
  - 适合加载图片、音频等资源。

- **OPTIONS 预检请求**  
  自动返回跨域许可响应，允许的方法包含 `QUERY`。

## 使用方法
- 代理 API 请求：  
  ```
  https://your-vercel-app.vercel.app/api/https/api.example.com/data.json
  ```
  （路径里写完整的 `https://` 仍可用，但会先吃一次 `308`。）
- 发送带请求体的 HTTP `QUERY` 请求：
  ```bash
  curl -X QUERY https://your-vercel-app.vercel.app/api/https/api.example.com/search \
    -H "Content-Type: application/json" \
    -d '{"query":"vercel proxy"}'
  ```
- 直接加载资源：  
  ```
  https://your-vercel-app.vercel.app/fetch/https://example.com/image.png
  ```

## 部署
- 在 `api/` 目录下放置代理函数（`proxy.js`、`fetch.js`）。  
- 在 `vercel.json` 中配置路径重写：
  ```json
  {
    "rewrites": [
      { "source": "/api/(.*)", "destination": "/api/proxy" },
      { "source": "/fetch/(.*)", "destination": "/api/fetch" }
    ]
  }
  ```
