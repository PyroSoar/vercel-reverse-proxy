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
// Response headers we must not copy: the runtime owns framing and the body may
// have been rewritten (decompressed) on the way through.
const NON_FORWARDABLE_RESPONSE_HEADERS = new Set([
  'access-control-allow-origin',
  'access-control-allow-methods',
  'access-control-allow-headers',
  'access-control-expose-headers',
  'access-control-allow-credentials',
  'content-encoding',
  'content-length',
  'transfer-encoding',
]);
const API_ALLOWED_TYPES = [
  'text/',
  'application/json',
  'application/xml',
  'text/xml',
  'application/x-www-form-urlencoded',
  'multipart/form-data',
  'application/octet-stream',
  'application/x-ndjson',
  'text/event-stream',
  'application/vnd.api+json',
];
const MAX_BYTES = 1024 * 1024; // 1MB
const RAW_BODY_TIMEOUT_MS = 5000;

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

// Split `/api/...` or `/fetch/...` into { mode, rest }.
function splitPrefix(rawUrl) {
  for (const prefix of ['/api/', '/fetch/']) {
    if (rawUrl.startsWith(prefix)) {
      return { mode: prefix === '/api/' ? 'api' : 'fetch', rest: rawUrl.slice(prefix.length) };
    }
  }
  return null;
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// Two accepted spellings for the target:
//   /api/https://host/path  -> Vercel collapses `//` in the path and replies 308
//                              before this function ever runs, so avoid it.
//   /api/https/host/path    -> no `//`, no redirect, same result. Recommended.
function resolveTarget(rawUrl) {
  const split = splitPrefix(rawUrl);
  if (!split) return null;

  let rest = split.rest;
  const schemeSplit = /^(https?)\/([^/].*)$/i.exec(rest);
  let target = schemeSplit ? `${schemeSplit[1]}://${schemeSplit[2]}` : rest;
  target = safeDecode(target);

  // Repair URLs whose scheme got collapsed to a single slash somewhere upstream
  // (`https:/host/path`), which happens after Vercel's 308 normalization.
  if (target.startsWith('https:/') && !target.startsWith('https://')) {
    target = target.replace('https:/', 'https://');
  }
  if (target.startsWith('http:/') && !target.startsWith('http://')) {
    target = target.replace('http:/', 'http://');
  }
  if (!target.startsWith('http')) return null;

  return { mode: split.mode, target };
}

// The runtime body parser already consumed the stream for JSON / urlencoded
// bodies and handed us an object. Rebuilding it must follow the original
// Content-Type: re-stringifying a form body as JSON makes the target receive a
// single key holding the whole JSON text, which upstream APIs reject.
function encodeFormBody(parsed) {
  const pairs = [];
  const walk = (value, key) => {
    if (value === undefined || value === null) {
      pairs.push([key, '']);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) walk(item, key);
      return;
    }
    if (typeof value === 'object') {
      for (const [childKey, childValue] of Object.entries(value)) {
        walk(childValue, key ? `${key}[${childKey}]` : childKey);
      }
      return;
    }
    pairs.push([key, String(value)]);
  };
  if (parsed && typeof parsed === 'object') {
    for (const [key, value] of Object.entries(parsed)) walk(value, key);
  }
  return new URLSearchParams(pairs).toString();
}

function readRawBody(req) {
  if (req.readableEnded === true) return Promise.resolve(null);
  return new Promise(resolve => {
    const chunks = [];
    let settled = false;
    const finish = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    // Never hang a serverless invocation on a stream the runtime already drained.
    const timer = setTimeout(() => finish(null), RAW_BODY_TIMEOUT_MS);
    req.on('data', chunk => chunks.push(Buffer.from(chunk)));
    req.on('end', () => finish(chunks.length ? Buffer.concat(chunks) : null));
    req.on('error', () => finish(null));
    req.on('aborted', () => finish(null));
    if (typeof req.resume === 'function') req.resume();
  });
}

async function requestBody(req, contentType) {
  const type = String(contentType || '').toLowerCase();
  const raw = await readRawBody(req);
  if (raw && raw.length) return raw;

  const parsed = req.body;
  if (parsed === undefined || parsed === null) return undefined;
  if (typeof parsed === 'string') return parsed;
  if (Buffer.isBuffer(parsed)) return parsed;
  if (type.startsWith('application/x-www-form-urlencoded')) return encodeFormBody(parsed);
  return JSON.stringify(parsed);
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

  const resolved = resolveTarget(req.url || '');
  if (!resolved) {
    res.status(400).send('invalid path: ' + req.url);
    return;
  }
  const { mode, target } = resolved;
  const isApi = mode === 'api';

  try {
    // Large-file guard for the asset endpoint. It runs only here: for /api/ the
    // extra HEAD round trip doubled latency and described the HEAD response's
    // type rather than the real one.
    if (!isApi) {
      const headResp = await fetch(target, { method: 'HEAD' }).catch(() => null);
      const headLength = parseInt(headResp?.headers.get('content-length') || '0', 10);
      if (headLength > MAX_BYTES) {
        res.status(413).send('Resource too large (>1MB).');
        return;
      }
    }

    const requestHeaders = forgeHeaders(req.headers, new URL(target));
    const body =
      isApi && BODY_METHODS.has(req.method)
        ? await requestBody(req, req.headers['content-type'])
        : undefined;

    const response = await fetch(target, {
      method: isApi ? req.method : 'GET',
      headers: requestHeaders,
      body,
      redirect: 'manual',
    });

    const declaredLength = parseInt(response.headers.get('content-length') || '0', 10);
    if (declaredLength > MAX_BYTES) {
      res.status(413).send('Resource too large (>1MB).');
      return;
    }

    if (isApi) {
      const responseType = String(response.headers.get('content-type') || '').toLowerCase();
      const allowed = !responseType || API_ALLOWED_TYPES.some(type => responseType.startsWith(type));
      if (!allowed) {
        res.status(415).send('Unsupported Media Type: ' + responseType);
        return;
      }
    }

    response.headers.forEach((value, key) => {
      if (!NON_FORWARDABLE_RESPONSE_HEADERS.has(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', '*');
    res.setHeader('X-Proxy-Method', req.method);
    try {
      const safeUrl = new URL(target);
      res.setHeader('X-Proxy-Target', safeUrl.origin + safeUrl.pathname);
    } catch {
      res.setHeader('X-Proxy-Target', encodeURI(target));
    }

    res.status(response.status);
    // Pass the bytes through untouched: re-serializing JSON changed the payload
    // length while the upstream content-type/length headers were still set.
    res.send(Buffer.from(await response.arrayBuffer()));
  } catch (err) {
    res.status(502).send('proxy error: ' + err.message);
  }
}
