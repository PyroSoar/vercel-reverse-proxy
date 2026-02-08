export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.status(204).end();
    return;
  }

  let targetUrl;
  if (req.url.startsWith('/api/')) {
    targetUrl = decodeURIComponent(req.url.replace(/^\/api\//, ''));
  } else if (req.url.startsWith('/fetch/')) {
    targetUrl = decodeURIComponent(req.url.replace(/^\/fetch\//, ''));
  } else {
    res.status(400).send('invalid path: ' + req.url);
    return;
  }

  if (targetUrl.startsWith('https:/') && !targetUrl.startsWith('https://')) {
    targetUrl = targetUrl.replace('https:/', 'https://');
  }
  if (targetUrl.startsWith('http:/') && !targetUrl.startsWith('http://')) {
    targetUrl = targetUrl.replace('http:/', 'http://');
  }

  if (!targetUrl.startsWith('http')) {
    res.status(400).send('invalid url: ' + targetUrl);
    return;
  }

  try {
    const isApi = req.url.startsWith('/api/');
    const response = await fetch(targetUrl, {
      method: isApi ? req.method : 'GET',
      headers: isApi ? req.headers : undefined,
      body: isApi && req.method === 'POST' ? req.body : undefined,
      redirect: 'manual',
    });

    // 复制响应头，但去掉 content-encoding
    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'content-encoding') {
        res.setHeader(key, value);
      }
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', '*');
    // 在复制响应头之后，额外加上代理信息
    res.setHeader('X-Proxy-Method', req.method);
    res.setHeader('X-Proxy-Target', targetUrl);

    res.status(response.status);

    // 统一大小检查
    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    if (contentLength > 1024 * 1024) {
      res.status(413).send('Resource too large (>1MB). If you need to fetch large files, please contact: lzctuhao@outlook.com.');
      return;
    }

    if (isApi) {
      // 客户端调用，返回 JSON 或文本
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await response.json();
        res.json(data);
      } else {
        const text = await response.text();
        res.send(text);
      }
    } else {
      // 浏览器直接访问资源
      if (contentLength === 0) {
        // 没有 Content-Length，直接放行
        const buffer = Buffer.from(await response.arrayBuffer());
        res.send(buffer);
      } else {
        // 有 Content-Length 且未超过限制
        const buffer = Buffer.from(await response.arrayBuffer());
        res.send(buffer);
      }
    }
  } catch (err) {
    res.status(502).send('proxy error: ' + err.message);
  }
}
