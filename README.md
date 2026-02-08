# Vercel Proxy Service

A simple HTTP proxy built with Vercel Serverless Functions. It helps bypass CORS restrictions and allows direct resource fetching.

## Features
- **`/api/`**  
  Full proxy interface for client-side scripts.  
  - Forwards request headers and body.  
  - Returns response headers and body intact.  
  - Adds CORS headers.

- **`/fetch/`**  
  Direct proxy for browsers.  
  - Fetches target resources without extra parameters.  
  - Useful for images, audio, or other assets.

- **OPTIONS Handling**  
  Responds to CORS preflight requests with permissive headers.

## Usage
- Proxy API requests:  
  ```
  https://your-vercel-app.vercel.app/api/https://example.com/data.json
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
  - 转发请求头和请求体。  
  - 原样返回响应头和响应体。  
  - 自动添加跨域许可头。

- **`/fetch/`**  
  面向浏览器的简化直链代理。  
  - 无需额外参数，直接抓取目标资源。  
  - 适合加载图片、音频等资源。

- **OPTIONS 预检请求**  
  自动返回跨域许可响应。

## 使用方法
- 代理 API 请求：  
  ```
  https://your-vercel-app.vercel.app/api/https://example.com/data.json
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
