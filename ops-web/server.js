const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, 'public');
const port = Number(process.env.PORT || 3000);
const apiOrigin = new URL(process.env.LETSGORIDE_API_ORIGIN || 'https://letsgoride-v2-production.onrender.com');
const apiClient = apiOrigin.protocol === 'http:' ? http : https;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function safePath(urlPath) {
  const clean = decodeURIComponent((urlPath || '/').split('?')[0]);
  const relative = clean === '/' ? 'index.html' : clean.replace(/^\/+/, '');
  const target = path.normalize(path.join(root, relative));
  return target.startsWith(root) ? target : null;
}

function securityHeaders(ext) {
  return {
    'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'self'; connect-src 'self' wss://letsgoride-v2-production.onrender.com; img-src 'self' data: https://tile.openstreetmap.org https://cdn.jsdelivr.net; style-src 'self' https://cdn.jsdelivr.net; script-src 'self' https://cdn.jsdelivr.net; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  };
}

function proxyApi(req, res) {
  const upstreamPath = (req.url || '/api/').replace(/^\/api/, '') || '/';
  const headers = {
    accept: 'application/json',
    'user-agent': 'LetsGoRide-Ops/1.0'
  };
  if (req.headers.authorization) headers.authorization = req.headers.authorization;
  if (req.headers['content-type']) headers['content-type'] = req.headers['content-type'];
  if (req.headers['content-length']) headers['content-length'] = req.headers['content-length'];

  const upstream = apiClient.request({
    protocol: apiOrigin.protocol,
    hostname: apiOrigin.hostname,
    port: apiOrigin.port || undefined,
    method: req.method,
    path: upstreamPath,
    headers,
    timeout: 20000
  }, upstreamRes => {
    const responseHeaders = {
      ...securityHeaders('.json'),
      'Content-Type': upstreamRes.headers['content-type'] || 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    };
    res.writeHead(upstreamRes.statusCode || 502, responseHeaders);
    upstreamRes.pipe(res);
  });

  upstream.on('timeout', () => upstream.destroy(new Error('Upstream timeout')));
  upstream.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(502, { ...securityHeaders('.json'), 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    }
    res.end(JSON.stringify({ success: false, error: 'LetsGoRide production API is temporarily unavailable.' }));
  });
  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  if ((req.url || '').startsWith('/api/')) {
    return proxyApi(req, res);
  }

  const target = safePath(req.url);
  if (!target) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Bad request');
  }

  fs.stat(target, (statErr, stat) => {
    let file = target;
    if (!statErr && stat.isDirectory()) file = path.join(target, 'index.html');
    fs.readFile(file, (err, body) => {
      if (err) {
        res.writeHead(404, { ...securityHeaders('.txt'), 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Not found');
      }
      const ext = path.extname(file).toLowerCase();
      res.writeHead(200, { ...securityHeaders(ext), 'Content-Type': types[ext] || 'application/octet-stream' });
      res.end(body);
    });
  });
});

server.listen(port, '0.0.0.0', () => console.log(`LetsGoRide Ops listening on ${port}`));
