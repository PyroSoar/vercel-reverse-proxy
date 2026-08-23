const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'QUERY', 'DELETE']);
const NON_FORWARDABLE_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function forgeHeaders(headers, targetUrlObj) {
  const requestHeaders = new Headers();
  const connectionHeaders = String(headers.connection || '')
    .split(',')
    .map(name => name.trim().toLowerCase())
    .filter(Boolean);
  const excludedHeaders = new Set([...NON_FORWARDABLE_HEADERS, ...connectionHeaders]);

  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined || excludedHeaders.has(name.toLowerCase())) continue;
    if (Array.isArray(value)) {
      for (const item of value) requestHeaders.append(name, item);
    } else {
      requestHeaders.set(name, value);
    }
  }

  requestHeaders.set('referer', targetUrlObj.origin + '/');
  requestHeaders.set('origin', targetUrlObj.origin);
  return requestHeaders;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,QUERY,DELETE,HEAD,OPTIONS');
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

    // Preserve end-to-end headers and identify the request as target-origin traffic.
    const requestHeaders = forgeHeaders(req.headers, new URL(targetUrl));

    // 请求体处理
    let body;
    // Preserve content for methods that define or commonly negotiate it.
    // DELETE content has no general semantics, but is forwarded when supplied
    // so APIs with an explicit client-origin agreement continue to work.
    if (isApi && BODY_METHODS.has(req.method)) {
      if (typeof req.body === 'string') {
        body = req.body;
      } else if (req.body instanceof Buffer) {
        body = req.body;
      } else if (req.body) {
        body = JSON.stringify(req.body);
      }
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
