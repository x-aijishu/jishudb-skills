import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../skills/jishudb/scripts/install-windows.js', import.meta.url), 'utf8');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const assetHost = 'https://release-assets.githubusercontent.com/github-production-release-asset/1316997274/installer';

function harness(t, bytes, network) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-download-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const assets = Object.fromEntries(['installer', 'checksum', 'candidate'].map((role, index) => [role, {
    id: index + 1, role, name: role === 'installer' ? 'Setup.exe' : `${role}.json`,
    size: role === 'installer' ? bytes.length : 10, sha256: role === 'installer' ? hash(bytes) : 'a'.repeat(64),
    url: `https://api.github.com/repos/x-aijishu/jishudb-desktop-releases/releases/assets/${index + 1}`,
  }]));
  const plan = { assets, release: { id: 1, tag: 'v0.9.8', targetCommitish: 'main' }, expiresAt: new Date(Date.now() + 1800000).toISOString(),
    connection: { url: 'http://127.0.0.1:8088/mcp' }, installation: {
      applicationRoot: path.join(root, 'app'), dataRoot: path.join(root, 'data'),
      bootstrapPath: path.join(root, 'state', 'data-location.json'),
    } };
  const release = { id: 1, immutable: true, draft: false, prerelease: false, tag_name: 'v0.9.8', target_commitish: 'main',
    assets: Object.values(assets).map(a => ({ ...a, state: 'uploaded', digest: `sha256:${a.sha256}` })) };
  const calls = [];
  const context = vm.createContext({ AbortSignal, Buffer, URL, console, module: { exports: {} }, process,
    setTimeout, clearTimeout, fixture: { root, plan }, fetch: async (url, options) => {
      calls.push({ url: String(url), options });
      if (String(url).endsWith('/releases/1')) return Response.json(release);
      return network(url, options, calls);
    } });
  vm.runInContext(source.replace(/^#![^\n]*\n/, ''), context);
  // Substitute only OS identity/ACL and approved-plan loading for portable orchestration tests.
  // Native Windows check/plan/download acceptance separately exercises these boundaries.
  vm.runInContext(`
    loadApprovedPlan = () => ({ plan: fixture.plan, transactionRoot: fixture.root, resolvedPlan: 'plan.json' });
    assertRegularPath = (target, type, category) => {
      const stat = fs.lstatSync(target);
      if (stat.isSymbolicLink() || (type === 'file' ? !stat.isFile() : !stat.isDirectory())) fail(category, 'not a regular path');
      return stat;
    };
    setPrivateAcl = () => {};
    assertPrivateAcl = () => {};
    isTcpPortAvailable = async () => true;
  `, context);
  return { helper: context.module.exports, root, plan, calls, context,
    run: () => context.module.exports.runDownload({}, { identity: {}, tools: {} }) };
}

function range(bytes, start = 0, end = bytes.length - 1, total = bytes.length) {
  return new Response(bytes, { status: 206, headers: { 'content-range': `bytes ${start}-${end}/${total}`, 'content-length': String(end - start + 1) } });
}

test('two range invocations resume exact bytes, cache release/URL, and verify final SHA', async t => {
  const bytes = Buffer.alloc(16 * 1024 * 1024 + 23, 71);
  const h = harness(t, bytes, (url, options) => {
    if (String(url).startsWith('https://api.github.com')) return new Response(null, { status: 302, headers: { location: assetHost } });
    assert.equal(options.headers.Accept, undefined);
    const [, start, end] = options.headers.Range.match(/bytes=(\d+)-(\d+)/).map(Number);
    return range(bytes.subarray(start, end + 1), start, end, bytes.length);
  });
  const first = await h.run();
  assert.equal(first.status, 'download_pending');
  assert.equal(first.downloadedBytes, 16 * 1024 * 1024);
  const second = await h.run();
  assert.equal(second.status, 'downloaded');
  assert.equal(second.bytesThisStep, 23);
  assert.deepEqual(fs.readFileSync(path.join(h.root, 'Setup.exe')), bytes);
  assert.equal(h.calls.filter(c => c.url.includes('api.github.com')).length, 2);
  assert.equal(fs.existsSync(path.join(h.root, 'download.lock')), false);
  assert.equal(fs.existsSync(path.join(h.root, 'download-url.json')), false);
  const count = h.calls.length;
  assert.equal((await h.run()).bytesThisStep, 0);
  assert.equal(h.calls.length, count);
});

test('validated timeout prefix resumes but a transport failure never changes cache', async t => {
  const h = harness(t, Buffer.from('abcdef'), () => { throw new Error('unused'); });
  const controller = new AbortController();
  const body = new ReadableStream({ start(c) {
    c.enqueue(Buffer.from('abc'));
    setTimeout(() => { controller.abort(new DOMException('deadline', 'TimeoutError')); c.error(controller.signal.reason); }, 10);
  } });
  const response = new Response(body, { status: 206, headers: { 'content-range': 'bytes 0-5/6' } });
  assert.equal((await h.helper.readDownloadRange(response, 0, 5, 6, controller.signal)).toString(), 'abc');
  const failed = new Response(new ReadableStream({ start(c) { c.enqueue(Buffer.from('abc')); setTimeout(() => c.error(new Error('connection reset')), 10); } }),
    { status: 206, headers: { 'content-range': 'bytes 0-5/6' } });
  await assert.rejects(h.helper.readDownloadRange(failed, 0, 5, 6, new AbortController().signal), e => e.category === 'download_network_failed');
});

for (const [label, response] of [
  ['ignored range', () => new Response('abcdef')],
  ['wrong offset', () => range('abc', 1, 3, 6)],
  ['wrong total', () => range('abcdef', 0, 5, 9)],
  ['encoding drift', () => new Response('abcdef', { status: 206, headers: { 'content-range': 'bytes 0-5/6', 'content-encoding': 'gzip' } })],
  ['truncated success', () => new Response('abc', { status: 206, headers: { 'content-range': 'bytes 0-5/6' } })],
]) {
  test(`${label} cannot append bytes`, async t => {
    const h = harness(t, Buffer.from('abcdef'), response);
    await assert.rejects(h.run());
    assert.equal(fs.existsSync(path.join(h.root, 'Setup.exe')), false);
    assert.equal(fs.existsSync(path.join(h.root, 'download.lock')), false);
  });
}

test('rate limits preserve cache and return bounded waiting without looping', async t => {
  const h = harness(t, Buffer.from('abcdef'), () => new Response(null, { status: 429, headers: { 'retry-after': '42' } }));
  const result = await h.run();
  assert.equal(result.status, 'download_waiting');
  assert.equal(result.retryAfterSeconds, 42);
  assert.equal(h.calls.length, 2);
  assert.equal(h.helper.rateLimitDelay(new Response(null, { status: 403 })), null);
});

test('cached URL 403 requests one refresh; freshly rejected URL is terminal', async t => {
  const h = harness(t, Buffer.from('abcdef'), url => String(url).startsWith('https://api.github.com')
    ? new Response(null, { status: 302, headers: { location: assetHost } }) : new Response(null, { status: 403 }));
  fs.writeFileSync(path.join(h.root, 'download-url.json'), JSON.stringify({ assetId: 1, url: assetHost, createdAt: new Date().toISOString() }));
  assert.equal((await h.run()).reason, 'download_url_refresh_required');
  await assert.rejects(h.run(), e => e.category === 'asset_download_failed');
});

test('foreign redirects and complete cache corruption fail closed', async t => {
  const h = harness(t, Buffer.from('abcdef'), () => new Response(null, { status: 302, headers: { location: 'https://example.com/installer' } }));
  await assert.rejects(h.run(), e => e.category === 'invalid_asset_redirect');
  fs.writeFileSync(path.join(h.root, 'Setup.exe'), 'xxxxxx');
  await assert.rejects(h.run(), e => e.category === 'digest_mismatch');
});

test('lock conflicts cannot delete another lock or change an existing partial file', async t => {
  const h = harness(t, Buffer.from('abcdef'), () => { throw new Error('must not fetch'); });
  fs.writeFileSync(path.join(h.root, 'download.lock'), JSON.stringify({ pid: process.pid }));
  fs.writeFileSync(path.join(h.root, 'Setup.exe'), 'abc');
  await assert.rejects(h.run(), e => e.category === 'download_locked');
  assert.equal(fs.readFileSync(path.join(h.root, 'Setup.exe'), 'utf8'), 'abc');
  assert.equal(fs.existsSync(path.join(h.root, 'download.lock')), true);
});

test('hard-linked download cache is rejected', async t => {
  const h = harness(t, Buffer.from('abcdef'), () => { throw new Error('must not fetch'); });
  const original = path.join(h.root, 'original');
  fs.writeFileSync(original, 'abc');
  fs.linkSync(original, path.join(h.root, 'Setup.exe'));
  await assert.rejects(h.run(), e => e.category === 'invalid_download_cache');
});

test('execute rejects missing or incomplete download before network or installer launch', async t => {
  const h = harness(t, Buffer.from('abcdef'), () => { throw new Error('must not fetch'); });
  const context = { identity: {}, tools: {} };
  await assert.rejects(h.helper.runExecute({}, context), e => e.category === 'download_required');
  fs.writeFileSync(path.join(h.root, 'Setup.exe'), 'abc');
  await assert.rejects(h.helper.runExecute({}, context), e => e.category === 'asset_size_mismatch');
  assert.equal(h.calls.length, 0);
  assert.equal(fs.readFileSync(path.join(h.root, 'Setup.exe'), 'utf8'), 'abc');
});

test('snapshot drift is rejected before contacting the network', async t => {
  const h = harness(t, Buffer.from('abcdef'), () => { throw new Error('must not fetch'); });
  fs.writeFileSync(path.join(h.root, 'download-release.json'), JSON.stringify({ id: 999, immutable: true }));
  await assert.rejects(h.run(), e => e.category === 'release_drift');
  assert.equal(h.calls.length, 0);
});

test('malformed cached URLs retain an actionable cache error', async t => {
  const h = harness(t, Buffer.from('abcdef'), () => { throw new Error('must not fetch an asset'); });
  fs.writeFileSync(path.join(h.root, 'download-url.json'), JSON.stringify({ assetId: 1, url: 'invalid', createdAt: new Date().toISOString() }));
  await assert.rejects(h.run(), e => e.category === 'invalid_download_cache');
});

test('an asset request network failure preserves its underlying diagnostic', async t => {
  const original = new TypeError('fetch failed', { cause: Object.assign(new Error('socket reset'), { code: 'ECONNRESET' }) });
  const h = harness(t, Buffer.from('abcdef'), () => { throw original; });
  await assert.rejects(h.run(), e => e.category === 'download_network_failed' && e.cause === original);
});

test('wrong complete installer hash cannot return downloaded', async t => {
  const h = harness(t, Buffer.from('abcdef'), () => range('ghijkl'));
  await assert.rejects(h.run(), e => e.category === 'digest_mismatch');
  assert.equal(fs.readFileSync(path.join(h.root, 'Setup.exe'), 'utf8'), 'ghijkl');
  assert.equal(fs.existsSync(path.join(h.root, 'download.lock')), false);
});
