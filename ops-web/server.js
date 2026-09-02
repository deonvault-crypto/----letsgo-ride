const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, 'public');
const port = Number(process.env.PORT || 3000);
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};

function safePath(urlPath) {
  const clean = decodeURIComponent((urlPath || '/').split('?')[0]);
  const relative = clean === '/' ? 'index.html' : clean.replace(/^\/+/, '');
  const target = path.normalize(path.join(root, relative));
  return target.startsWith(root) ? target : null;
}

const server = http.createServer((req, res) => {
  const target = safePath(req.url);
  if (!target) { res.writeHead(400); return res.end('Bad request'); }
  fs.stat(target, (statErr, stat) => {
    let file = target;
    if (!statErr && stat.isDirectory()) file = path.join(target, 'index.html');
    fs.readFile(file, (err, body) => {
      if (err) { res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8'}); return res.end('Not found'); }
      const ext = path.extname(file).toLowerCase();
      res.writeHead(200, {
        'Content-Type': types[ext] || 'application/octet-stream',
        'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        'Content-Security-Policy': "default-src 'self'; connect-src 'self' https://letsgoride-v2-production.onrender.com; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
      });
      res.end(body);
    });
  });
});

server.listen(port, '0.0.0.0', () => console.log(`LetsGoRide Ops listening on ${port}`));
