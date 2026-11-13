import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Miniflare } from 'miniflare';

const root = fileURLToPath(new URL('../', import.meta.url));
const now = 1_800_000_000_000;
let runtime, db;

before(async () => {
  runtime = new Miniflare({
    scriptPath: `${root}test/fixtures/lab-worker.mjs`,
    modulesRoot: root,
    modules: true,
    compatibilityDate: '2026-07-29',
    d1Databases: ['DB'],
    durableObjects: { REALTIME: { className: 'RealtimeRoom', useSQLite: true } },
  });
  db = await runtime.getD1Database('DB');
  const directory = new URL('../migrations/', import.meta.url);
  for (const name of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()) {
    const sql = await readFile(new URL(name, directory), 'utf8');
    // D1's exec API treats each line as a separate statement. Passing a
    // migration as a batch also preserves a trigger body as one statement.
    const statements = sql.split(/;\n(?=\s*(?:--|CREATE|$))/).filter(part => part.trim());
    await db.batch(statements.map(statement => db.prepare(statement)));
  }
});

after(async () => { await runtime?.dispose(); });

test('the deployable Worker serves liveness and stays unready with a real D1 binding', async () => {
  const healthRuntime = new Miniflare({
    scriptPath: `${root}src/index.mjs`, modules: true,
    compatibilityDate: '2026-07-29', d1Databases: ['DB'],
  });
  try {
    const live = await healthRuntime.dispatchFetch('http://localhost/health/live');
    assert.equal(live.status, 200);
    const ready = await healthRuntime.dispatchFetch('http://localhost/health/ready');
    assert.equal(ready.status, 503);
    assert.equal((await ready.json()).data.database_status, 'connected');
  } finally {
    await healthRuntime.dispose();
  }
});

test('canonical EJSON SQL imports into D1 with typed IDs, relationships and matching hashes', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'lgr-d1-import-'));
  const sha256 = value => createHash('sha256').update(value).digest('hex');
  const user = { $oid: '500000000000000000000000' };
  const trip = { $oid: '600000000000000000000000' };
  const settlement = { $oid: '700000000000000000000000' };
  const fixtures = {
    users: { _id: user, id: 'synthetic-user' },
    hailing_trips: { _id: trip, passenger_user_id: 'synthetic-user', user_ref: user },
    driver_settlement_payments: { _id: settlement, trip_ref: trip, amount: { $numberDecimal: '13.20' } },
    audit_logs: { _id: { event: 'synthetic-capture', sequence: { $numberLong: '9007199254740993' } }, payment_ref: settlement },
  };
  try {
    for (const [collection, record] of Object.entries(fixtures)) {
      const source = join(scratch, collection + '.ndjson');
      const target = join(scratch, collection);
      const raw = JSON.stringify(record);
      await writeFile(source, raw + '\n');
      execFileSync(process.execPath, [`${root}scripts/ejson-to-d1.mjs`, '--collection', collection, '--input', source, '--output', target]);
      const manifest = JSON.parse(await readFile(join(target, 'manifest.json'), 'utf8'));
      assert.equal(manifest.document_count, 1);
      assert.equal(manifest.sha256_normalized_ndjson, sha256(raw + '\n'));
      for (const chunk of manifest.chunks) {
        const sql = await readFile(join(target, chunk.file), 'utf8');
        assert.equal(sha256(sql), chunk.sha256);
        assert.equal(Buffer.byteLength(sql), chunk.bytes);
        await db.exec(sql.trim());
      }
      const { results } = await db.prepare(
        'SELECT id_ejson, id_sha256, document_ejson, document_sha256 FROM mongo_archive WHERE source_collection = ?',
      ).bind(collection).all();
      assert.deepEqual(results, [{
        id_ejson: JSON.stringify(record._id), id_sha256: sha256(JSON.stringify(record._id)),
        document_ejson: raw, document_sha256: sha256(raw),
      }]);
    }
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

async function post(path, body) {
  const response = await runtime.dispatchFetch(`http://localhost/${path}`, {
    method: 'POST', body: JSON.stringify(body),
  });
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
}

async function createDriver(id, { lat = -17.83, lon = 31.06, approved = 1, available = 1, rideClass = 'standard', seen = now } = {}) {
  await db.prepare('INSERT INTO lab_drivers VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, approved, available, rideClass, lat, lon, seen).run();
}

async function createTrip(id, { lat = -17.83, lon = 31.06, expires = now + 120_000 } = {}) {
  await db.prepare(`INSERT INTO lab_trips (id, passenger_user_id, client_request_id, ride_class,
    pickup_latitude, pickup_longitude, status, search_expires_ms)
    VALUES (?, ?, ?, 'standard', ?, ?, 'SEARCHING', ?)`)
    .bind(id, `passenger-${id}`, `request-${id}`, lat, lon, expires).run();
}

test('D1 geospatial query ranks only fresh eligible drivers and handles the antimeridian', async () => {
  await createTrip('geo');
  await createDriver('geo-nearest', { lon: 31.061 });
  await createDriver('geo-second', { lon: 31.07 });
  await createDriver('geo-far', { lon: 31.15 });
  await createDriver('geo-stale', { seen: now - 75_001 });
  await createDriver('geo-unapproved', { approved: 0 });
  await createDriver('geo-offline', { available: 0 });
  await createDriver('geo-wrong-class', { rideClass: 'premium' });
  const matches = await post('nearby', { tripId: 'geo', radiusKm: 2, now });
  assert.deepEqual(matches.map(row => row.id), ['geo-nearest', 'geo-second']);
  assert.ok(matches[0].pickup_distance_km < matches[1].pickup_distance_km);
  await createTrip('dateline', { lat: 0, lon: 179.99 });
  await createDriver('dateline-driver', { lat: 0, lon: -179.99 });
  assert.deepEqual((await post('nearby', { tripId: 'dateline', radiusKm: 4, now })).map(row => row.id), ['dateline-driver']);
});

test('D1 assigns one driver, rejects replay and commits the notification intent with the trip', async () => {
  await createTrip('match-one');
  await createTrip('match-two');
  await createDriver('match-driver');
  const offers = await Promise.all(['match-one', 'match-two'].map(tripId => post('reserve', { tripId, driverId: 'match-driver', now })));
  assert.equal(offers.filter(Boolean).length, 1);
  const offer = offers.find(Boolean);
  assert.equal(await post('accept', { offerId: offer.id, driverId: 'not-the-driver', now }), null);
  const accepted = await Promise.all([1, 2].map(() => post('accept', { offerId: offer.id, driverId: 'match-driver', now })));
  assert.deepEqual(accepted.filter(Boolean), [{ id: offer.trip_id, driver_id: 'match-driver', status: 'DRIVER_ASSIGNED', version: 2 }]);
  assert.equal(await db.prepare('SELECT status FROM lab_dispatch_offers WHERE id = ?').bind(offer.id).first('status'), 'accepted');
  assert.equal(await db.prepare('SELECT count(*) AS total FROM lab_outbox WHERE resource_id = ?').bind(offer.trip_id).first('total'), 1);
  const losingTrip = ['match-one', 'match-two'].find(id => id !== offer.trip_id);
  assert.equal(await post('reserve', { tripId: losingTrip, driverId: 'match-driver', now }), null);
});

test('expired offers cannot assign a driver and can be swept for rematching', async () => {
  await createTrip('expired');
  await createDriver('expire-driver');
  const offer = await post('reserve', { tripId: 'expired', driverId: 'expire-driver', now });
  assert.equal(await post('accept', { offerId: offer.id, driverId: 'expire-driver', now: offer.expires_ms }), null);
  assert.equal(await post('expire', { now: offer.expires_ms }), 1);
  assert.equal(await db.prepare('SELECT status FROM lab_dispatch_offers WHERE id = ?').bind(offer.id).first('status'), 'expired');
  assert.equal(await post('reserve', { tripId: 'expired', driverId: 'expire-driver', now: offer.expires_ms }), null);
  await createDriver('rematch-driver', { seen: offer.expires_ms });
  assert.ok(await post('reserve', { tripId: 'expired', driverId: 'rematch-driver', now: offer.expires_ms }));
});

test('outbox redelivers a timed-out claim and rejects completion by the old lease owner', async () => {
  const claims = await Promise.all([1, 2].map(() => post('claim', { now, leaseMs: 1000 })));
  assert.equal(claims.filter(Boolean).length, 1);
  const first = claims.find(Boolean);
  assert.equal(first.attempts, 1);
  assert.equal(await post('claim', { now: now + 999, leaseMs: 1000 }), null);
  const retry = await post('claim', { now: now + 1000, leaseMs: 1000 });
  assert.equal(retry.event_id, first.event_id);
  assert.equal(retry.attempts, 2);
  assert.notEqual(retry.lease_token, first.lease_token);
  assert.equal(await post('complete', { eventId: first.event_id, leaseToken: first.lease_token, now: now + 1001 }), false);
  assert.equal(await post('complete', { eventId: retry.event_id, leaseToken: retry.lease_token, now: now + 1001 }), true);
  assert.equal(await post('claim', { now: now + 10_000 }), null);
});

test('D1 rejects mismatched captures and posts one ledger entry under concurrent replay', async () => {
  await db.prepare("INSERT INTO lab_payments VALUES ('payment-one', 'sandbox', 'provider-one', 'usd', 270, 'authorized')").run();
  await db.prepare("INSERT INTO lab_payments VALUES ('payment-two', 'sandbox', 'provider-two', 'usd', 270, 'authorized')").run();
  const capture = { accountId: 'sandbox', eventId: 'event-one', paymentId: 'provider-one', currency: 'usd', amountMinor: 270 };
  assert.equal(await post('capture', { ...capture, accountId: 'different-account' }), 'mismatch');
  assert.equal(await post('capture', { ...capture, amountMinor: 271 }), 'mismatch');
  assert.equal(await post('capture', { ...capture, currency: 'zwg' }), 'mismatch');
  assert.deepEqual((await Promise.all([post('capture', capture), post('capture', capture)])).sort(), ['recorded', 'replayed']);
  assert.equal(await post('capture', { ...capture, paymentId: 'provider-two' }), 'mismatch');
  assert.equal(await post('capture', { ...capture, eventId: 'event-two' }), 'recorded');
  const { results } = await db.prepare('SELECT * FROM lab_payment_ledger').all();
  assert.deepEqual(results, [{ payment_id: 'payment-one', currency: 'usd', amount_minor: 270 }]);
});

test('SQLite Durable Objects accept authenticated sockets and deliver only to the selected user', async () => {
  async function connect(token) {
    return runtime.dispatchFetch('http://localhost/realtime', { headers: {
      Upgrade: 'websocket', 'Sec-WebSocket-Protocol': `letsgoride.realtime.v1, letsgoride.auth.${token}`,
    } });
  }
  assert.equal((await connect('unknown')).status, 401);
  const connections = [];
  try {
    for (const role of ['passenger', 'driver']) {
      const response = await connect(`test-${role}-session`);
      assert.equal(response.status, 101);
      assert.equal(response.headers.get('Sec-WebSocket-Protocol'), 'letsgoride.realtime.v1');
      const socket = response.webSocket;
      const messages = [];
      socket.addEventListener('message', event => messages.push(event.data));
      socket.accept();
      connections.push({ socket, messages });
    }
    const envelope = { event_id: 'test-event', type: 'hailing.trip.driver_assigned', version: 2, resource_id: 'test-trip' };
    for (const userId of ['test-passenger', 'test-driver']) {
      const response = await runtime.dispatchFetch('http://localhost/fixture-publish', {
        method: 'POST', body: JSON.stringify({ userId, envelope: { ...envelope, audience: userId } }),
      });
      assert.equal(response.status, 204);
    }
    for (const { socket } of connections) socket.send('ping');
    for (let retries = 0; retries < 80 && connections.some(connection => connection.messages.length < 3); retries++) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    for (const [index, { messages }] of connections.entries()) {
      assert.deepEqual(messages, [JSON.stringify({ type: 'realtime.ready' }),
        JSON.stringify({ ...envelope, audience: `test-${index === 0 ? 'passenger' : 'driver'}` }), 'pong']);
    }
  } finally {
    for (const { socket } of connections) socket.close();
  }
});
