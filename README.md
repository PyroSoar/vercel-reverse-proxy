# Vercel Proxy Service

A simple HTTP proxy built with Vercel Serverless Functions. It helps bypass CORS restrictions and allows direct resource fetching.

## Features
- **`/api/`**  
  Full proxy interface for client-side scripts.  
  - Preserves the original HTTP method.
  - Preserves incoming end-to-end request headers. Hop-by-hop and runtime-managed headers such as `Host`, `Connection`, and `Content-Length` are excluded.
  - Replaces `Referer` with the target origin plus `/` and replaces `Origin` with the target origin.
  - Forwards request bodies for `POST`, `PUT`, `PATCH`, and `QUERY`.
  - Forwards a `DELETE` body only when one is supplied; use it only when the target API explicitly supports it because HTTP defines no general semantics for `DELETE` content.
  - Does not attach request bodies to `GET` or `HEAD`.
  - Returns response headers and body intact.  
  - Adds CORS headers.

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
  https://your-vercel-app.vercel.app/api/https://example.com/data.json
  ```
- Send an HTTP `QUERY` request with content:
  ```bash
  curl -X QUERY https://your-vercel-app.vercel.app/api/https://api.example.com/search \
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
- **`/api/`**  
  面向客户端脚本的完整代理接口。  
  - 保留原始 HTTP 请求方法。
  - 保留客户端的端到端请求头；`Host`、`Connection`、`Content-Length` 等逐跳或运行时管理的请求头除外。
  - 将 `Referer` 替换为目标站点根地址，并将 `Origin` 替换为目标站点源。
  - 转发 `POST`、`PUT`、`PATCH` 和 `QUERY` 请求体。
  - 仅在客户端提供时转发 `DELETE` 请求体；HTTP 没有为其定义通用语义，因此仅应在目标 API 明确支持时使用。
  - 不为 `GET` 或 `HEAD` 附加请求体。
  - 原样返回响应头和响应体。  
  - 自动添加跨域许可头。

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
  https://your-vercel-app.vercel.app/api/https://example.com/data.json
  ```
- 发送带请求体的 HTTP `QUERY` 请求：
  ```bash
  curl -X QUERY https://your-vercel-app.vercel.app/api/https://api.example.com/search \
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
