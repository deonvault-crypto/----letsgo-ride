const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const port = 3917;
const cwd = __dirname;
const child = spawn(process.execPath, ['server.js'], {
  cwd,
  env: {
    ...process.env,
    PORT: String(port),
    LETSGORIDE_API_ORIGIN: 'http://127.0.0.1:9',
  },
  stdio: 'ignore',
});

function requestHealth() {
  return new Promise((resolve, reject) => {
    const request = http.get(`http://127.0.0.1:${port}/health/live`, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (response.statusCode !== 200) throw new Error(`Unexpected status ${response.statusCode}`);
          if (body?.success !== true || body?.data?.status !== 'alive' || body?.data?.service !== 'letsgoride-ops') {
            throw new Error('Unexpected liveness response body');
          }
          if (String(response.headers['cache-control'] || '').toLowerCase() !== 'no-store') {
            throw new Error('Liveness response must use Cache-Control: no-store');
          }
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('error', reject);
    request.setTimeout(1000, () => request.destroy(new Error('Liveness request timed out')));
  });
}

(async () => {
  try {
    let lastError = new Error('Ops server did not become ready');
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        await requestHealth();
        process.exitCode = 0;
        return;
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    throw lastError;
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    child.kill('SIGTERM');
  }
})();
