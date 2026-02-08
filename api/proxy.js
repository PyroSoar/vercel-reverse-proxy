export default async function handler(req, res) {
  // 处理跨域预检请求
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.status(204).end();
    return;
  }

  // 判断是 /api/ 还是 /fetch/
  let targetUrl;
  if (req.url.startsWith('/api/')) {
    targetUrl = decodeURIComponent(req.url.replace(/^\/api\//, ''));
  } else if (req.url.startsWith('/fetch/')) {
    targetUrl = decodeURIComponent(req.url.replace(/^\/fetch\//, ''));
  } else {
    res.status(400).send('invalid path: ' + req.url);
    return;
  }

  // 修复 https:/ → https://, http:/ → http://
  if (targetUrl.startsWith('https:/') && !targetUrl.startsWith('https://')) {
    targetUrl = targetUrl.replace('https:/', 'https://');
  }
  if (targetUrl.startsWith('http:/') && !targetUrl.startsWith('http://')) {
    targetUrl = targetUrl.replace('http:/', 'http://');
  }

  // 最终合法性检查
  if (!targetUrl.startsWith('http')) {
    res.status(400).send('invalid url: ' + targetUrl);
    return;
  }

  try {
    // /api/ 保留请求头和请求体，/fetch/ 简单 GET
    const response = await fetch(targetUrl, {
      method: req.url.startsWith('/api/') ? req.method : 'GET',
      headers: req.url.startsWith('/api/') ? req.headers : undefined,
      body: req.url.startsWith('/api/') && req.method === 'POST' ? req.body : undefined,
      redirect: 'manual',
    });

    // 复制响应头
    response.headers.forEach((value, key) => res.setHeader(key, value));

    // 添加跨域许可
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', '*');

    // 返回响应
    res.status(response.status);
    const buffer = Buffer.from(await response.arrayBuffer());
    res.send(buffer);
  } catch (err) {
    res.status(502).send('proxy error: ' + err.message);
  }
}
