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

    // 先发 HEAD 请求检查大小和类型
    const headResp = await fetch(targetUrl, { method: 'HEAD' });
    const contentLength = parseInt(headResp.headers.get('content-length') || '0', 10);
    const contentType = headResp.headers.get('content-type') || '';

    // 大小检查
    if (contentLength > 1024 * 1024) {
      res.status(413).send('Resource too large (>1MB).');
      return;
    }

    // 类型检查（仅 /api/）
    if (isApi) {
      const allowedTypes = [
        'text/',
        'application/json',
        'application/xml',
        'text/xml',
        'application/x-www-form-urlencoded',
        'multipart/form-data',
        'application/octet-stream',
        'application/x-ndjson',
        'text/event-stream',
        'application/vnd.api+json'
      ];
      const isAllowed = allowedTypes.some(type => contentType.startsWith(type));
      if (!isAllowed) {
        res.status(415).send('Unsupported Media Type: ' + contentType);
        return;
      }
    }

    // 通过检查后再发起真正请求
    const response = await fetch(targetUrl, {
      method: isApi ? req.method : 'GET',
      headers: isApi ? req.headers : undefined,
      body: isApi && req.method === 'POST' ? req.body : undefined,
      redirect: 'manual',
    });

    response.headers.forEach((value, key) => {
      if (key.toLowerCase() !== 'content-encoding') {
        res.setHeader(key, value);
      }
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', '*');
    res.setHeader('X-Proxy-Method', req.method);
    try {
      const safeUrl = new URL(targetUrl);
      res.setHeader('X-Proxy-Target', safeUrl.origin + safeUrl.pathname);
    } catch {
      res.setHeader('X-Proxy-Target', encodeURI(targetUrl));
    }

    res.status(response.status);

    if (isApi) {
      const respType = response.headers.get('content-type') || '';
      if (respType.includes('application/json')) {
        const data = await response.json();
        res.json(data);
      } else {
        const text = await response.text();
        res.send(text);
      }
    } else {
      const buffer = Buffer.from(await response.arrayBuffer());
      res.send(buffer);
    }
  } catch (err) {
    res.status(502).send('proxy error: ' + err.message);
  }
}
