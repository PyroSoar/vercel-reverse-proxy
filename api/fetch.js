export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.status(204).end();
    return;
  }

  const targetUrl = req.url.replace(/^\/fetch\//, '');
  if (!targetUrl.startsWith('http')) {
    res.status(400).send('invalid url');
    return;
  }

  try {
    const response = await fetch(targetUrl);

    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Expose-Headers', '*');

    res.status(response.status);
    const buffer = Buffer.from(await response.arrayBuffer());
    res.send(buffer);
  } catch (err) {
    res.status(502).send('fetch error: ' + err.message);
  }
}
