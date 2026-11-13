#!/usr/bin/env node
/**
 * Offline Mongo Extended JSON NDJSON -> D1 staging SQL. Never touches a remote service.
 * Retains the raw document text and original typed _id in a staging archive table.
 */
import { createReadStream } from 'node:fs';
import { access, mkdir, mkdtemp, rename, rm, writeFile, chmod } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { resolve, dirname, basename, join } from 'node:path';

const digest = value => createHash('sha256').update(value).digest('hex');
const quote = value => "'" + String(value).replaceAll("'", "''") + "'";
const MAX_STATEMENT_BYTES = 95000;
const MAX_CHUNK_BYTES = 450000;

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}
function argsFrom(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!['--collection', '--input', '--output'].includes(argv[i]) || !argv[i + 1]) {
      throw Error('Usage: --collection NAME --input /private/file.ndjson --output generated/NAME');
    }
    args[argv[i].slice(2)] = argv[i + 1];
  }
  if (!args.collection || !args.input || !args.output) throw Error('Missing required flags');
  if (!/^[A-Za-z][A-Za-z0-9_]{0,119}$/.test(args.collection)) throw Error('Collection name is not safe');
  return args;
}
async function main() {
  const {collection, input, output} = argsFrom(process.argv.slice(2));
  const source = resolve(input), destination = resolve(output);
  if (source === destination || source.startsWith(destination + '/')) throw Error('Source inside output directory');
  try { await access(destination); throw Error('Output exists; refusing to overwrite'); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  await mkdir(dirname(destination), {recursive:true});
  const temporary = await mkdtemp(join(dirname(destination), '.lgr-ejson-stage-'));
  await chmod(temporary, 0o700);
  const ids = new Set(), chunks = [], sourceHash = createHash('sha256');
  let lines = '', count = 0;
  async function flush() {
    if (!lines) return;
    const file = 'chunk-' + String(chunks.length + 1).padStart(5,'0') + '.sql';
    await writeFile(join(temporary,file),lines,{mode:0o600,flag:'wx'});
    chunks.push({file,sha256:digest(lines),bytes:Buffer.byteLength(lines)});
    lines='';
  }
  try {
    const stream = createInterface({input:createReadStream(source,{encoding:'utf8'}),crlfDelay:Infinity});
    for await (const document of stream) {
      if (!document.trim()) continue;
      const item = JSON.parse(document);
      if (!item || typeof item !== 'object' || Array.isArray(item) || !Object.hasOwn(item,'_id')) throw Error('Record ' + (count+1) + ': missing _id');
      const idEjson = JSON.stringify(item._id);
      if (!idEjson || idEjson === 'null') throw Error('Record ' + (count+1) + ': invalid _id');
      const idSha = digest(canonical(item._id));
      if (ids.has(idSha)) throw Error('Record ' + (count+1) + ': duplicate _id');
      ids.add(idSha);
      const statement = 'INSERT INTO mongo_archive (source_collection,id_sha256,id_ejson,document_ejson,document_sha256) VALUES (' +
        [collection,idSha,idEjson,document,digest(document)].map(quote).join(',') + ');\n';
      if (Buffer.byteLength(statement) > MAX_STATEMENT_BYTES) throw Error('Record ' + (count+1) + ': SQL statement limit exceeded');
      if (Buffer.byteLength(lines)+Buffer.byteLength(statement)>MAX_CHUNK_BYTES) await flush();
      lines+=statement;
      sourceHash.update(document,'utf8').update('\n');
      count++;
    }
    if (count===0) throw Error('Empty export refused');
    await flush();
    const manifest={format:'letsgoride-mongo-ejson-archive-v1',production_ready:false,
      source_collection:collection,source_filename:basename(source),document_count:count,
      sha256_normalized_ndjson:sourceHash.digest('hex'),chunks,
      notice:'Private customer data. Do not commit or publish. Not a production database.'};
    await writeFile(join(temporary,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{mode:0o600,flag:'wx'});
    await rename(temporary,destination);
    process.stdout.write('Prepared '+count+' '+collection+' records in '+chunks.length+' private SQL chunks. No remote writes.\n');
  } catch(e) {
    await rm(temporary,{recursive:true,force:true});
    throw e;
  }
}
main().catch(e=>{console.error('Archive preparation failed: '+e.message);process.exitCode=1;});
