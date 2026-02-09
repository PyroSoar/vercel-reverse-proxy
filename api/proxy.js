export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      req.headers['access-control-request-headers'] || 'Content-Type, Authorization'
    );
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

    // HEAD 请求检查大小和类型
    const headResp = await fetch(targetUrl, { method: 'HEAD' });
    const contentLength = parseInt(headResp.headers.get('content-length') || '0', 10);
    const contentType = headResp.headers.get('content-type') || '';

    if (contentLength > 1024 * 1024) {
      res.status(413).send('Resource too large (>1MB).');
      return;
    }

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

    // 构造请求头
    const requestHeaders = {};
    if (req.headers['content-type']) {
      requestHeaders['content-type'] = req.headers['content-type'];
    }
    if (req.headers['authorization']) {
      requestHeaders['authorization'] = req.headers['authorization'];
    }
    try {
      const targetUrlObj = new URL(targetUrl);
      requestHeaders['Referer'] = targetUrlObj.origin + '/';
    } catch {
      requestHeaders['Referer'] = targetUrl;
    }

    // 请求体处理
    let body;
    if (isApi && ['POST', 'PUT', 'PATCH'].includes(req.method)) {
      body = await req.text();
    }

    const response = await fetch(targetUrl, {
      method: isApi ? req.method : 'GET',
      headers: requestHeaders,
      body,
      redirect: 'manual',
    });

    response.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (!['content-encoding', 'access-control-allow-origin', 'access-control-allow-methods', 'access-control-allow-headers', 'access-control-expose-headers', 'access-control-allow-credentials'].includes(lowerKey)) {
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
