const fs = require('fs');

const [fullPath, productionPath, policyPath] = process.argv.slice(2);
if (!fullPath || !productionPath || !policyPath) {
  console.error('Usage: node check-mobile-audit-policy.cjs <full-audit.json> <production-audit.json> <policy.json>');
  process.exit(2);
}

const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
const allowed = new Map((policy.allowedAdvisories || []).map((item) => [item.id, item]));
const ghsaPattern = /GHSA-[0-9a-z-]+/i;

function advisoryId(entry) {
  const candidates = [entry?.url, entry?.title, entry?.name]
    .filter((value) => typeof value === 'string');
  for (const candidate of candidates) {
    const match = candidate.match(ghsaPattern);
    if (match) return match[0].toUpperCase();
  }
  return null;
}

function analyze(path, label) {
  const report = JSON.parse(fs.readFileSync(path, 'utf8'));
  const metadata = report.metadata?.vulnerabilities || {};
  const vulnerabilities = report.vulnerabilities || {};
  const concrete = new Map();
  const unexplained = [];

  function resolve(name, seen = new Set()) {
    if (seen.has(name)) return new Set();
    seen.add(name);
    const item = vulnerabilities[name];
    if (!item) return new Set();

    const ids = new Set();
    for (const via of item.via || []) {
      if (typeof via === 'string') {
        for (const id of resolve(via, new Set(seen))) ids.add(id);
        continue;
      }

      const id = advisoryId(via);
      if (!id) {
        unexplained.push({ package: name, source: via?.source ?? null, title: via?.title ?? null, url: via?.url ?? null });
        continue;
      }
      ids.add(id);
      if (!concrete.has(id)) {
        concrete.set(id, {
          id,
          package: via?.name || name,
          severity: via?.severity || item.severity,
          title: via?.title || '',
          url: via?.url || '',
        });
      }
    }
    return ids;
  }

  console.log(`=== NPM AUDIT ${label} SUMMARY ===`);
  console.log(JSON.stringify(metadata));

  if (Number(metadata.critical || 0) > 0) {
    throw new Error(`${label}: critical npm vulnerability detected`);
  }

  const unresolvedPackages = [];
  for (const name of Object.keys(vulnerabilities)) {
    const ids = resolve(name);
    if (ids.size === 0) unresolvedPackages.push(name);
  }

  if (unexplained.length > 0) {
    console.error(`${label}: advisory entries without a GHSA identifier: ${JSON.stringify(unexplained)}`);
    throw new Error(`${label}: unexplained npm advisory entry detected`);
  }

  if (unresolvedPackages.length > 0) {
    console.error(`${label}: vulnerability chains with no concrete advisory: ${unresolvedPackages.join(', ')}`);
    throw new Error(`${label}: unexplained vulnerability chain detected`);
  }

  const unknown = [...concrete.keys()].filter((id) => !allowed.has(id));
  if (unknown.length > 0) {
    console.error(`${label}: new/unreviewed advisories: ${unknown.join(', ')}`);
    for (const id of unknown) console.error(JSON.stringify(concrete.get(id)));
    throw new Error(`${label}: unreviewed npm advisory detected`);
  }

  const activeAllowed = [...concrete.keys()].filter((id) => allowed.has(id));
  if (activeAllowed.length > 0) {
    const expiry = new Date(`${policy.expiresOn}T23:59:59Z`);
    if (Number.isNaN(expiry.getTime())) throw new Error('Invalid mobile audit exception expiry date');
    if (Date.now() > expiry.getTime()) {
      throw new Error(`Mobile audit exceptions expired on ${policy.expiresOn}`);
    }
  }

  for (const id of [...concrete.keys()].sort()) {
    const current = concrete.get(id);
    const exception = allowed.get(id);
    console.log(`AUDIT_EXCEPTION ${label} ${JSON.stringify({
      ...current,
      reviewedAt: policy.reviewedAt,
      expiresOn: policy.expiresOn,
      reason: exception?.reason,
    })}`);
  }

  return { metadata, concrete };
}

try {
  const full = analyze(fullPath, 'FULL');
  const production = analyze(productionPath, 'PRODUCTION');
  console.log(`Mobile npm audit policy passed. Reviewed exceptions expire ${policy.expiresOn}.`);
  console.log(`Concrete advisories: full=${full.concrete.size}, production=${production.concrete.size}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
