import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, access, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const script = join(root, 'scripts/ejson-to-d1.mjs');
const schema = join(root, 'migrations/0001_mongo_archive.sql');
const run = (input, output, collection = 'users') => spawnSync(process.execPath, [
  script, '--collection', collection, '--input', input, '--output', output
], { encoding: 'utf8' });
async function withTemp(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'lgr-cloudflare-poc-'));
  try { return await fn(dir); }
  finally { await rm(dir, { recursive: true, force: true }); }
}

test('synthetic EJSON exports preserve typed Mongo IDs and payloads in valid SQLite SQL', () => withTemp(async dir => {
  const input = join(dir, 'synthetic.ndjson'), output = join(dir, 'generated');
  const lines = [
    JSON.stringify({ _id: { $oid: '000000000000000000000001' }, name: "O'Hara", price: { $numberDecimal: '0.00' } }),
    JSON.stringify({ _id: 'string-id', created: { $date: { $numberLong: '1700000000000' } } })
  ];
  await writeFile(input, lines.join('\n') + '\n');
  const result = run(input, output);
  assert.equal(result.status, 0, result.stderr);
  const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'));
  assert.equal(manifest.document_count, 2);
  assert.equal(manifest.chunks.length, 1);
  const sql = await readFile(join(output, 'chunk-00001.sql'), 'utf8');
  assert.match(sql, /O''Hara/);
  assert.match(sql, /\$numberDecimal/);
  const py = [
    'import sqlite3, json, sys',
    'db=sqlite3.connect(":memory:")',
    'db.executescript(open(sys.argv[1],encoding="utf8").read())',
    'db.executescript(open(sys.argv[2],encoding="utf8").read())',
    'rows=db.execute("select id_ejson,document_ejson from mongo_archive order by rowid").fetchall()',
    'assert len(rows)==2',
    'assert json.loads(rows[0][0])=={"$oid":"000000000000000000000001"}',
    'assert json.loads(rows[0][1])["name"]=="O\'Hara"',
    'assert json.loads(rows[1][0])=="string-id"'
  ].join('\n');
  const checked = spawnSync('python3', ['-c', py, schema, join(output, 'chunk-00001.sql')], { encoding: 'utf8' });
  assert.equal(checked.status, 0, checked.stderr);
}));

test('duplicate _id is rejected without committing partial output', () => withTemp(async dir => {
  const input = join(dir, 'duplicate.ndjson'), output = join(dir, 'generated');
  const record = JSON.stringify({ _id: { $oid: '000000000000000000000001' }, synthetic: true });
  await writeFile(input, record + '\n' + record + '\n');
  const result = run(input, output);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /duplicate _id/);
  await assert.rejects(() => access(output));
}));

test('empty and oversized exports fail instead of skipping records', () => withTemp(async dir => {
  const input = join(dir, 'input.ndjson'), output = join(dir, 'generated');
  await writeFile(input, '\n');
  assert.notEqual(run(input, output).status, 0);
  await writeFile(input, JSON.stringify({ _id: 'synthetic', payload: 'x'.repeat(98000) }) + '\n');
  const result = run(input, output);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SQL statement limit/);
  await assert.rejects(() => access(output));
}));

test('SQL injection in collection names is blocked', () => withTemp(async dir => {
  const input = join(dir, 'input.ndjson'), output = join(dir, 'generated');
  await writeFile(input, JSON.stringify({ _id: 'synthetic' }) + '\n');
  const result = run(input, output, 'users; DROP TABLE rides;');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not safe/);
}));

test('canonical EJSON retains embedded BSON field order, extended numbers and null IDs', () => withTemp(async dir => {
  const input = join(dir, 'types.ndjson'), output = join(dir, 'generated');
  await writeFile(input, [
    '{"_id": {"10": {"$numberLong": "9007199254740993"}, "2": "x"}}',
    '{"_id":{"2":"x","10":{"$numberLong":"9007199254740993"}}}',
    '{"_id": null}',
  ].join('\n'));
  const converted = run(input, output);
  assert.equal(converted.status, 0, converted.stderr);
  const sql = await readFile(join(output, 'chunk-00001.sql'), 'utf8');
  assert.ok(sql.includes("'{\"10\":{\"$numberLong\":\"9007199254740993\"},\"2\":\"x\"}'"));
  assert.ok(sql.includes("'{\"2\":\"x\",\"10\":{\"$numberLong\":\"9007199254740993\"}}'"));
  assert.ok(sql.includes("'null'"));
  const retry = run(input, output);
  assert.notEqual(retry.status, 0);
  assert.equal(await readFile(join(output, 'chunk-00001.sql'), 'utf8'), sql);
}));

test('invalid JSON fails without putting input contents in the error', () => withTemp(async dir => {
  const input = join(dir, 'invalid.ndjson'), output = join(dir, 'generated');
  await writeFile(input, '{"_id":synthetic-sensitive-fragment}');
  const result = run(input, output);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Record 1: invalid JSON/);
  assert.doesNotMatch(result.stderr, /synthetic-sensitive-fragment/);
  await assert.rejects(() => access(output));
}));
