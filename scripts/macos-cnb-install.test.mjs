import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { renewCatalogPayload } from './fixtures/mirror-catalog-renewal.mjs';

const require = createRequire(import.meta.url);
const { createMacCnbBridge, normalizedRelease, transportBinding, assertCatalogURL } = require('../skills/jishudb/scripts/install-macos-cnb.cjs');
const { artifactSpecifications, signCatalog, verifyCatalog } = require('../skills/jishudb/scripts/release-mirror-catalog.cjs');
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const publicBytes = publicKey.export({ type: 'spki', format: 'der' });
const authority = { algorithm: 'Ed25519', publicKey: publicBytes.toString('base64'),
  keyId: `ed25519-sha256:${createHash('sha256').update(publicBytes).digest('hex')}` };
const privateBytes = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
const NOW = Date.parse('2026-10-12T08:00:00.000Z');
const DATA = Buffer.from('abcdefghijklmnopqrstuvwxyz');
const DIGEST = createHash('sha256').update(DATA).digest('hex');
const REPO = 'x-aijishu/jishudb-desktop-releases';
const ROOT = `https://cnb.cool/${REPO}`;
const config = { catalogURL: `${ROOT}/-/releases/latest/download/jishudb-release-catalog.json`, authority,
  minimumSequence: 1, minimumVersion: '0.9.9', bootstrapRedirectAllowlist: [
    { origin: 'https://cnb.cool', pathPrefix: `/${REPO}/-/releases/download/` },
    { origin: 'https://asset.cnb.cool', pathPrefix: '/assets/t/' },
  ] };

function payload(sequence = 1) {
  const version = '0.9.9';
  return { schemaVersion: 1, domain: 'jishudb-release-mirror-catalog-v1', product: 'jishudb-desktop',
    channel: 'stable', sequence, version, sourceRevision: 'a'.repeat(40),
    issuedAt: new Date(NOW - 1000).toISOString(), expiresAt: new Date(NOW + 3600000).toISOString(),
    canonicalRelease: { repository: REPO, id: 123, tag: `v${version}`, targetCommitish: 'main',
      url: `https://github.com/${REPO}/releases/tag/v${version}` },
    mirror: { repositoryURL: ROOT, redirectAllowlist: [{ origin: 'https://asset.cnb.cool', pathPrefix: '/assets/t/' }] },
    artifacts: artifactSpecifications(version).map((item, index) => ({ ...item, size: DATA.length, sha256: DIGEST,
      assetId: index + 1, canonicalURL: `https://github.com/${REPO}/releases/download/v${version}/${item.name}`,
      mirrorURL: `${ROOT}/-/releases/download/v${version}/${item.name}` })),
  };
}

function signed(value = payload()) { return signCatalog(value, privateBytes, authority); }
function context(value = signed()) {
  const verified = verifyCatalog(value, { authority, nowMs: NOW });
  return { envelope: value, release: normalizedRelease(verified), transport: transportBinding(verified, config) };
}
function plan(value = context()) {
  const assets = Object.fromEntries([['installer', '.dmg'], ['candidate', '.dmg.candidate.json'], ['checksum', '.dmg.sha256']]
    .map(([role, suffix]) => {
      const asset = value.release.assets.find((entry) => entry.name.endsWith(suffix));
      return [role, { role, id: asset.id, name: asset.name, size: asset.size, url: asset.url, sha256: DIGEST }];
    }));
  return { transport: value.transport, expiresAt: new Date(NOW + 1800000).toISOString(),
    release: { id: 123, tag: 'v0.9.9', version: '0.9.9', sourceRevision: 'a'.repeat(40), targetCommitish: 'main' }, assets };
}
async function fixture(t, options = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mac-cnb-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, bridge: createMacCnbBridge({ config, now: () => NOW,
    statePath: path.join(directory, 'state.json'), ...options }) };
}

test('catalog discovery uses only anonymous pinned CNB bootstrap paths and persists rollback floor', async (t) => {
  const requests = [];
  const { directory, bridge } = await fixture(t, { fetchImpl: async (url, options) => {
    requests.push(url);
    assert.equal(options.redirect, 'manual');
    assert.equal(options.headers.Authorization, undefined);
    assert.doesNotMatch(url, /github/);
    if (url === config.catalogURL) return new Response(null, { status: 302, headers: { Location: 'https://asset.cnb.cool/assets/t/catalog' } });
    return new Response(JSON.stringify(signed()));
  } });
  const result = await bridge.discover();
  assert.equal(result.transport.source, 'cnb');
  assert.match(result.release.assets[0].url, /^https:\/\/api\.github\.com\/repos\//);
  assert.equal(requests.length, 2);
  assert.equal(JSON.parse(await readFile(path.join(directory, 'state.json'))).sequence, 1);
});

test('approved transactions keep their catalog without fetching mutable latest or Github', async (t) => {
  const { bridge } = await fixture(t, { fetchImpl: () => { throw new Error('No network expected'); } });
  const approved = plan();
  assert.deepEqual((await bridge.discover(approved)).transport, approved.transport);
  const changed = structuredClone(approved);
  changed.transport.sequence += 1;
  await assert.rejects(bridge.discover(changed), { code: 'release_drift' });
  changed.transport = approved.transport;
  changed.assets.installer.sha256 = 'b'.repeat(64);
  await assert.rejects(bridge.discover(changed), { code: 'release_drift' });
});

test('plan expiry, catalog expiry, metadata tampering and rollback remain distinct failures', async (t) => {
  let envelope = signed(payload(2));
  const { bridge } = await fixture(t, { fetchImpl: async () => new Response(JSON.stringify(envelope)) });
  await bridge.discover();
  envelope = signed(payload(1));
  await assert.rejects(bridge.discover(), { code: 'catalog_rollback' });
  envelope = signed({ ...payload(2), expiresAt: new Date(NOW + 3500000).toISOString() });
  await assert.rejects(bridge.discover(), { code: 'catalog_equivocation' });
  const approved = plan();
  approved.expiresAt = new Date(NOW - 1).toISOString();
  await assert.rejects(bridge.discover(approved), { code: 'plan_expired' });
  const expired = createMacCnbBridge({ config, now: () => NOW + 3600000 });
  await assert.rejects(expired.discover(plan()), { code: 'catalog_expired' });
  const tampered = structuredClone(plan());
  tampered.transport.catalog.payload.sourceRevision = 'b'.repeat(40);
  await assert.rejects(bridge.discover(tampered), { code: 'catalog_signature_invalid' });
});

test('bootstrap redirects reject a different repository, opaque path, insecure URL or Github', () => {
  for (const invalid of ['https://cnb.cool/other/repo/-/releases/download/v1/catalog',
    'https://asset.cnb.cool/other/catalog', 'https://github.com/catalog',
    'http://asset.cnb.cool/assets/t/catalog', 'https://user:pass@asset.cnb.cool/assets/t/catalog']) {
    assert.throws(() => assertCatalogURL(invalid, config), { code: 'blocked_origin' });
  }
});

test('metadata download maps canonical identity to signed mirror and verifies its complete bytes', async (t) => {
  const requests = [];
  const { bridge, directory } = await fixture(t, { fetchImpl: async (url, options) => {
    requests.push(url);
    assert.doesNotMatch(url, /github/);
    assert.equal(options.headers.Authorization, undefined);
    return new Response(DATA);
  } });
  const approved = plan();
  const destination = path.join(directory, 'candidate');
  await bridge.asset(context(), approved.assets.candidate.url, destination);
  assert.deepEqual(await readFile(destination), DATA);
  assert.equal(requests[0], `${ROOT}/-/releases/download/v0.9.9/${approved.assets.candidate.name}`);
});

test('range transfer preserves timeout bytes and resumes from their exact offset', async (t) => {
  let first = true;
  const { directory, bridge } = await fixture(t, { transferTimeoutMs: 20, fetchImpl: async (_url, { signal, headers }) => {
    const [start, end] = headers.Range.slice(6).split('-').map(Number);
    const responseHeaders = { 'Content-Range': `bytes ${start}-${end}/${DATA.length}` };
    if (first) {
      first = false;
      const stream = new ReadableStream({ start(controller) {
        controller.enqueue(DATA.subarray(start, start + 3));
        signal.addEventListener('abort', () => controller.error(signal.reason), { once: true });
      } });
      return new Response(stream, { status: 206, headers: responseHeaders });
    }
    return new Response(DATA.subarray(start, end + 1), { status: 206, headers: responseHeaders });
  } });
  const timeout = new AbortController();
  let deadlines = 0;
  t.mock.method(AbortSignal, 'timeout', () => ++deadlines === 1 ? timeout.signal : new AbortController().signal);
  const firstPath = path.join(directory, 'first');
  const secondPath = path.join(directory, 'second');
  // Expire only after the first prefix is written, avoiding scheduler-dependent
  // failures where a short wall-clock deadline fires before the file opens.
  const files = require('node:fs/promises');
  const open = files.open.bind(files);
  t.mock.method(files, 'open', async (...args) => {
    const file = await open(...args);
    if (args[0] === firstPath) {
      const write = file.writeFile.bind(file);
      file.writeFile = async (...values) => {
        await write(...values);
        timeout.abort(new DOMException('Fixture transfer deadline', 'TimeoutError'));
      };
    }
    return file;
  });
  const url = plan().assets.installer.url;
  const initial = await bridge.asset(context(), url, firstPath, { offset: 0, end: 9 });
  assert.deepEqual(initial, { httpStatus: '206', bytes: 3, curlCode: 28 });
  const next = await bridge.asset(context(), url, secondPath, { offset: initial.bytes, end: DATA.length - 1 });
  assert.equal(next.bytes, 23);
  assert.deepEqual(Buffer.concat([await readFile(firstPath), await readFile(secondPath)]), DATA);
});

test('wrong range, metadata digest and redirect host fail before cached bytes can advance', async (t) => {
  const scenarios = [
    { response: () => new Response(DATA, { status: 206, headers: { 'Content-Range': 'bytes 1-25/26' } }),
      range: { offset: 0, end: 25 }, code: 'invalid_download_slice' },
    { response: () => new Response(Buffer.alloc(DATA.length)), range: {}, code: 'digest_mismatch' },
    { response: () => new Response(null, { status: 302, headers: { Location: 'https://api.github.com/file' } }),
      range: {}, code: 'blocked_origin' },
  ];
  for (const scenario of scenarios) {
    const { directory, bridge } = await fixture(t, { fetchImpl: scenario.response });
    await assert.rejects(bridge.asset(context(), plan().assets.candidate.url, path.join(directory, 'bytes'), scenario.range),
      { code: scenario.code });
  }
});

test('catalog unavailable is not misreported as signature failure', async (t) => {
  const { bridge } = await fixture(t, { fetchImpl: async () => new Response(null, { status: 404 }) });
  await assert.rejects(bridge.discover(), { code: 'catalog_unavailable' });
});

test('transport errors retain sanitized internal causes without signed URLs', async (t) => {
  const { bridge } = await fixture(t, { fetchImpl: async () => {
    throw new TypeError('fetch failed https://asset.cnb.cool/assets/t/file?secret=value', {
      cause: Object.assign(new Error('connection reset'), { code: 'ECONNRESET' }),
    });
  } });
  await assert.rejects(bridge.discover(), (error) => {
    assert.equal(error.code, 'transport_failed');
    assert.equal(error.cause.name, 'TypeError');
    assert.equal(error.cause.cause.code, 'ECONNRESET');
    assert.doesNotMatch(error.cause.message, /secret|https:/);
    return true;
  });
});

test('private rollback state rejects symlinks and oversized files before network access', async (t) => {
  const { bridge, directory } = await fixture(t, { fetchImpl: () => { throw new Error('Network must not be called'); } });
  const state = path.join(directory, 'state.json');
  const target = path.join(directory, 'target.json');
  await writeFile(target, '{}', { mode: 0o600 });
  await symlink(target, state);
  await assert.rejects(bridge.discover(), { code: 'unsafe_cache' });
  await rm(state);
  await writeFile(state, Buffer.alloc(1024 * 1024 + 1), { mode: 0o600 });
  await assert.rejects(bridge.discover(), { code: 'unsafe_cache' });
});

test('actual JXA plan contract accepts signed CNB binding and preserves canonical asset IDs', () => {
  const source = readFileSync(new URL('../skills/jishudb/scripts/install-macos.zsh', import.meta.url), 'utf8');
  const embedded = source.match(/<<'JXA'\r?\n([\s\S]*?)\r?\nJXA\r?\n/)[1];
  class FixtureDate extends Date { constructor(...args) { super(...(args.length ? args : [NOW])); } }
  const helpers = runInNewContext(`${embedded}\n({selectFromReleases,createPlan,validatePlan});`, {
    ObjC: { import() {} }, Date: FixtureDate,
  });
  const selection = helpers.selectFromReleases([context().release], null);
  selection.transport = context().transport;
  const approved = helpers.createPlan(selection, { revision: 'a'.repeat(40), schemaVersion: 3,
    distribution: { teamIdentifier: 'ABCDEFGHIJ' }, agentBackgroundLaunch: 1 },
  ['501', '/Users/test/Applications/JishuDB.app', '/Users/test/Library/Application Support/JishuDB', 'test', '/Users/test/mcp.json', 'jishudb', 'http://127.0.0.1:8088/mcp']);
  assert.equal(helpers.validatePlan(approved).transport.source, 'cnb');
  assert.match(approved.assets.installer.url, /^https:\/\/api\.github\.com\//);
  const originalExpiry = approved.expiresAt;
  assert.equal(originalExpiry, context().envelope.payload.expiresAt);
  approved.transport.source = 'github';
  assert.throws(() => helpers.validatePlan(approved), /transport/);
  assert.equal(approved.expiresAt, originalExpiry);
});


test('schema 2 macOS renewal uses policy transport while preserving canonical application identity', async t => {
  const original = payload();
  const renewed = renewCatalogPayload(original);
  const envelope = signed(renewed);
  const selected = context(envelope);
  const approved = plan(selected);
  const requests = [];
  const { bridge, directory } = await fixture(t, { fetchImpl: async url => {
    requests.push(url);
    assert.doesNotMatch(url, /github/);
    return url === config.catalogURL ? new Response(JSON.stringify(envelope))
      : url.endsWith('.dmg') ? new Response(DATA, { status: 206, headers: { 'Content-Range': `bytes 0-${DATA.length - 1}/${DATA.length}` } })
        : new Response(DATA);
  } });
  const discovered = await bridge.discover();
  assert.equal(discovered.release.id, original.canonicalRelease.id);
  assert.equal(discovered.release.tag_name, original.canonicalRelease.tag);
  assert.equal(discovered.release.target_commitish, original.canonicalRelease.targetCommitish);
  assert.notEqual(discovered.release.id, renewed.policyRelease.id);
  assert.deepEqual((await bridge.discover(approved)).transport, approved.transport);
  for (const role of ['installer', 'candidate', 'checksum']) {
    const asset = approved.assets[role];
    const canonical = original.artifacts.find(item => item.name === asset.name);
    assert.equal(asset.id, canonical.assetId);
    assert.equal(asset.sha256, canonical.sha256);
    await bridge.asset(discovered, asset.url, path.join(directory, role), role === 'installer' ? { offset: 0, end: DATA.length - 1 } : {});
  }
  assert.ok(requests.slice(1).every(url => url.includes('/download/v0.9.9-policy.2/')));
});

test('actual macOS JXA planner keeps schema 2 policy tags out of native release fields', () => {
  const source = readFileSync(new URL('../skills/jishudb/scripts/install-macos.zsh', import.meta.url), 'utf8');
  const embedded = source.match(/<<'JXA'\r?\n([\s\S]*?)\r?\nJXA\r?\n/)[1];
  class FixtureDate extends Date { constructor(...args) { super(...(args.length ? args : [NOW])); } }
  const helpers = runInNewContext(`${embedded}\n({selectFromReleases,createPlan,validatePlan});`, {
    ObjC: { import() {} }, Date: FixtureDate,
  });
  const mirror = context(signed(renewCatalogPayload(payload())));
  const selection = helpers.selectFromReleases([mirror.release], null);
  selection.transport = mirror.transport;
  const approved = helpers.createPlan(selection, { revision: 'a'.repeat(40), schemaVersion: 3,
    distribution: { teamIdentifier: 'ABCDEFGHIJ' }, agentBackgroundLaunch: 1 },
  ['501', '/Users/test/Applications/JishuDB.app', '/Users/test/Library/Application Support/JishuDB', 'test', '/Users/test/mcp.json', 'jishudb', 'http://127.0.0.1:8088/mcp']);
  const validated = helpers.validatePlan(approved);
  assert.equal(validated.release.tag, 'v0.9.9');
  assert.equal(validated.release.id, 123);
  assert.equal(validated.transport.catalog.payload.schemaVersion, 2);
  assert.equal(validated.transport.catalog.payload.mirror.releaseTag, 'v0.9.9-policy.2');
  assert.equal(validated.expiresAt, mirror.envelope.payload.expiresAt);
});


test('macOS reopens exact old approvals after schema 1 and two schema 2 selections', async t => {
  let envelope = signed();
  const requests = [];
  const { bridge } = await fixture(t, { fetchImpl: async url => {
    requests.push(url);
    assert.equal(url, config.catalogURL);
    return new Response(JSON.stringify(envelope));
  } });
  const approvals = [];
  for (let generation = 1; generation <= 3; generation += 1) {
    if (generation > 1) envelope = signed(renewCatalogPayload(envelope.payload));
    approvals.push(plan(await bridge.discover()));
  }
  assert.equal(requests.length, 3);
  for (const [index, approved] of approvals.entries()) {
    const reopened = await bridge.discover(approved);
    assert.deepEqual(reopened.transport, approved.transport);
    assert.equal(reopened.envelope.payload.sequence, index + 1);
    assert.equal(reopened.release.tag_name, 'v0.9.9');
    const generation = index === 0 ? 'v0.9.9' : `v0.9.9-policy.${index + 1}`;
    assert.ok(reopened.envelope.payload.artifacts.every(asset => asset.mirrorURL.includes(`/download/${generation}/`)));
  }
  assert.equal(requests.length, 3, 'reopening exact approvals must not fetch mutable latest');
});
