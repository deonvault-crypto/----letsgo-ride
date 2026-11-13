import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.mjs';

const call = (path, env = {}, method = 'GET') =>
  worker.fetch(new Request('https://localhost' + path, { method }), env);

test('liveness is explicit and never reports production ready', async () => {
  const r = await call('/health/live');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Cache-Control'), 'no-store');
  assert.equal(r.headers.get('X-LetsGoRide-Prototype'), 'true');
  assert.equal((await r.json()).data.production_ready, false);
});
test('readiness always blocked without DB', async () => {
  const r = await call('/health/ready');
  assert.equal(r.status, 503);
  assert.equal((await r.json()).data.database_status, 'not_configured');
});
test('connected D1 is NOT a migrated app', async () => {
  const r = await call('/health/ready', { DB: { prepare: () => ({ first: async () => ({ connected: 1 }) }) } });
  assert.equal(r.status, 503);
  const body = await r.json();
  assert.equal(body.data.database_status, 'connected');
  assert.equal(body.data.production_ready, false);
});
test('D1 errors do not leak connection details', async () => {
  const r = await call('/health/ready', { DB: { prepare: () => { throw Error('SECRET'); } } });
  assert.equal(r.status, 503);
  assert.doesNotMatch(await r.text(), /SECRET/);
});
test('all real API routes refuse traffic, regardless of method or flag', async () => {
  for (const route of ['/auth/login', '/hailing/trips', '/rides', '/payments/webhook', '/']) {
    for (const method of ['GET','POST','OPTIONS']) {
      const r = await call(route, { CUTOVER_ENABLED: 'true' }, method);
      assert.equal(r.status, 503, method + ' ' + route);
      assert.equal(r.headers.get('Access-Control-Allow-Origin'), null);
      assert.equal(r.headers.get('Cache-Control'), 'no-store');
    }
  }
});
