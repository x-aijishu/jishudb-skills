import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { renewCatalogPayload } from './fixtures/mirror-catalog-renewal.mjs';

const require = createRequire(import.meta.url);
const catalog = require('../skills/jishudb/scripts/release-mirror-catalog.cjs');
const helperText = fs.readFileSync(new URL('../skills/jishudb/scripts/install-windows.js', import.meta.url), 'utf8');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const keys = crypto.generateKeyPairSync('ed25519');
const privateKey = keys.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
const authority = catalog.normalizeAuthority({ algorithm: 'Ed25519', publicKey: keys.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'), keyId: `ed25519-sha256:${hash(keys.publicKey.export({ type: 'spki', format: 'der' }))}` });

function fixture({ installerBytes = Buffer.from('fixture installer, never executed') } = {}) {
  const version = '0.9.9';
  const name = `JishuDB-Windows-x64-${version}-Setup.exe`;
  const revision = 'a'.repeat(40);
  const candidate = { schemaVersion: 1, product: 'jishudb-desktop', productName: 'JishuDB', bundleIdentifier: 'com.aijishu.jishudb', version, revision,
    target: 'windows-x64', minimumSystemVersion: '10.0.22621', runtimeLock: { path: 'packaging/windows/desktop-runtime-lock.json', sha256: 'b'.repeat(64) },
    artifact: { name, sha256: hash(installerBytes), size: installerBytes.length },
    distribution: { mode: 'per-user-nsis-v1', publisherIdentity: 'none', authenticode: 'not-signed', smartScreenAssessment: 'unknown-publisher-manual-approval-required', installationScope: 'current-user' },
    authorization: { mode: 'windows-fresh-install-v1', publisherIdentity: 'none' }, publication: { requested: true },
    source: { repository: 'x-aijishu/jishudb', runId: '123', runAttempt: 1 }, agentBackgroundLaunch: 1 };
  const contents = new Map([[name, installerBytes], [`${name}.candidate.json`, Buffer.from(JSON.stringify(candidate))], [`${name}.sha256`, Buffer.from(`${hash(installerBytes)}  ${name}\n`)]]);
  const repo = 'https://cnb.cool/x-aijishu/jishudb-desktop-releases';
  const payload = { schemaVersion: 1, domain: catalog.DOMAIN, product: 'jishudb-desktop', channel: 'stable', sequence: 10, version, sourceRevision: revision,
    issuedAt: new Date(Date.now() - 60000).toISOString(), expiresAt: new Date(Date.now() + 3600000).toISOString(),
    canonicalRelease: { repository: catalog.REPOSITORY, id: 123, tag: `v${version}`, targetCommitish: 'main', url: `https://github.com/${catalog.REPOSITORY}/releases/tag/v${version}` },
    mirror: { repositoryURL: repo, redirectAllowlist: [{ origin: 'https://asset.cnb.cool', pathPrefix: '/assets/t/' }] },
    artifacts: catalog.artifactSpecifications(version).map((spec, index) => {
      const bytes = contents.get(spec.name) ?? Buffer.from(`unused fixture ${spec.name}`);
      contents.set(spec.name, bytes);
      return { ...spec, size: bytes.length, sha256: hash(bytes), assetId: index + 1,
        canonicalURL: `https://github.com/${catalog.REPOSITORY}/releases/download/v${version}/${spec.name}`,
        mirrorURL: `${repo}/-/releases/download/v${version}/${spec.name}` };
    }) };
  const trust = { authority, catalogURL: `${repo}/-/releases/latest/download/jishudb-release-catalog.json`, minimumSequence: 1, minimumVersion: version,
    bootstrapRedirectAllowlist: [{ origin: 'https://asset.cnb.cool', pathPrefix: '/assets/t/' }] };
  return { payload, contents, trust, name, bytes: () => Buffer.from(JSON.stringify(catalog.signCatalog(payload, privateKey, authority))) };
}

async function harness(t, options = {}) {
  const f = fixture(options);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'windows-cnb-'));
  const localAppData = path.join(root, 'local');
  fs.mkdirSync(localAppData);
  const calls = [];
  const requests = [];
  const launches = [];
  const interactiveLaunches = [];
  let handler;
  const server = http.createServer((req, res) => {
    requests.push({ url: req.url, headers: req.headers });
    const requested = new URL(req.url, 'http://fixture');
    if (handler?.(req, res, requested)) return;
    if (requested.pathname.endsWith('jishudb-release-catalog.json')) {
      res.writeHead(302, { Location: 'https://asset.cnb.cool/assets/t/catalog' }); res.end(); return;
    }
    if (requested.pathname === '/assets/t/catalog') { res.end(f.bytes()); return; }
    const name = path.basename(requested.pathname);
    const bytes = f.contents.get(name);
    if (!bytes) { res.writeHead(404); res.end(); return; }
    if (!requested.pathname.startsWith('/assets/t/')) { res.writeHead(302, { Location: `https://asset.cnb.cool/assets/t/${name}` }); res.end(); return; }
    if (req.headers.range) {
      const [, first, last] = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range);
      const start = Number(first), end = Number(last);
      res.writeHead(206, { 'Content-Range': `bytes ${start}-${end}/${bytes.length}`, 'Content-Length': end - start + 1 });
      res.end(bytes.subarray(start, end + 1));
    } else res.end(bytes);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); fs.rmSync(root, { recursive: true, force: true }); });
  const portableProcess = Object.create(process);
  portableProcess.getBuiltinModule = name => {
    if (name === 'node:os') return { ...os, release: () => '10.0.22621' };
    if (name === 'node:child_process') return {
      spawnSync(command, args) {
        launches.push({ command, args });
        const childPath = args.find(arg => arg.startsWith('/JISHUDB_AGENT_PLAN=')).slice('/JISHUDB_AGENT_PLAN='.length);
        const childBytes = fs.readFileSync(childPath);
        assert.equal(args.at(-1), `/JISHUDB_AGENT_PLAN_SHA256=${hash(childBytes)}`);
        const child = JSON.parse(childBytes);
        assert.equal(child.schema, 'jishudb-agent-install-plan-v2');
        assert.ok(child.assets.installer.url.startsWith('https://api.github.com/'));
        for (const filename of [path.join(child.installation.applicationRoot, 'JishuDB.exe'), path.join(child.installation.applicationRoot, 'resources/runtime/jishudb.exe'), child.installation.bootstrapPath]) {
          fs.mkdirSync(path.dirname(filename), { recursive: true }); fs.writeFileSync(filename, 'fixture receipt');
        }
        return { status: 0 };
      },
      spawn(command, args, spawnOptions) {
        if (command.endsWith('explorer.exe')) interactiveLaunches.push({ command, args, spawnOptions });
        const emitter = new EventEmitter(); emitter.unref = () => {};
        queueMicrotask(() => {
          emitter.emit('spawn');
          if (command.endsWith('explorer.exe')) emitter.emit('close', options.brokerExitCode ?? 1, null);
        });
        return emitter;
      },
    };
    return process.getBuiltinModule(name);
  };
  const context = vm.createContext({ AbortSignal, Buffer, URL, console, module: { exports: {} }, process: portableProcess, setTimeout, clearTimeout,
    fixtureSupport: { catalog, trust: f.trust }, fetch: async (url, init) => {
      const target = new URL(url);
      // Fail immediately if any discovery, validation, candidate or range path
      // tries GitHub. Forward only approved fixture hosts through actual HTTP.
      assert.ok(['cnb.cool', 'asset.cnb.cool'].includes(target.hostname), `forbidden network destination: ${target.hostname}`);
      calls.push({ url: target.href, init });
      return fetch(`http://127.0.0.1:${server.address().port}${target.pathname}${target.search}`, init);
    } });
  vm.runInContext(helperText.replace(/^#![^\n]*\n/, ''), context);
  // Only Windows filesystem/identity admission and native process execution are
  // substituted. Catalog verification, approval hashes and all source/network,
  // bounded-range, disk cache and execute orchestration use production code.
  vm.runInContext(`
    loadMirrorSupport = () => fixtureSupport;
    assertWindowsX64 = () => {};
    assertNoReparseAncestors = target => path.resolve(target);
    normalizeLocalWindowsPath = target => path.resolve(target);
    setPrivateAcl = () => {};
    assertPrivateAcl = () => {};
    createPrivateDirectory = target => fs.mkdirSync(target);
    getFreeDesktopMcpUrl = async () => 'http://127.0.0.1:8088/mcp';
    isTcpPortAvailable = async () => true;
  `, context);
  const helper = context.module.exports;
  const environment = { identity: { sid: 'S-1-5-21-1-2-3-1001' }, localAppData, tempRoot: root, tools: { explorer: path.join(root, 'explorer.exe') } };
  return { ...f, helper, environment, context, root, calls, requests, launches, interactiveLaunches, setHandler: fn => { handler = fn; },
    plan: () => helper.runPlan(helper.parseArguments(['plan', '-Client', 'WorkBuddy', '-ConfigTarget', path.join(root, 'client.json'), '-ConnectionName', 'jishudb']), environment) };
}

function args(approval) { return { planPath: approval.planPath, planSha256: approval.planSha256 }; }

function rewrite(approval, mutate) {
  const value = JSON.parse(fs.readFileSync(approval.planPath));
  mutate(value);
  const bytes = Buffer.from(JSON.stringify(value));
  fs.writeFileSync(approval.planPath, bytes);
  return { ...args(approval), planSha256: hash(bytes) };
}

test('CNB plan, bounded resume and execute use actual HTTP with every GitHub destination forbidden', async t => {
  const h = await harness(t, { installerBytes: Buffer.alloc(16 * 1024 * 1024 + 23, 71) });
  const approval = await h.plan();
  assert.equal(approval.status, 'plan_ready');
  assert.equal(approval.authorization.status, 'caller_verification_required');
  assert.equal(approval.next, 'download_when_authorized');
  assert.equal(approval.approval.releaseSource, 'cnb');
  const outer = JSON.parse(fs.readFileSync(approval.planPath));
  assert.equal(outer.nativePlan.sha256, approval.approval.nativePlanSha256);
  assert.equal((await h.helper.runDownload(args(approval), h.environment)).status, 'download_pending');
  assert.equal((await h.helper.runDownload({ ...args(approval), releaseSource: 'cnb' }, h.environment)).status, 'downloaded');
  // Latest disappearing/advancing cannot retarget or block a still-valid exact
  // approval. Execution uses its pinned, independently authenticated catalog.
  h.setHandler((req, res, url) => { if (url.pathname.includes('catalog')) { res.writeHead(404); res.end(); return true; } return false; });
  assert.equal((await h.helper.runExecute(args(approval), h.environment)).status, 'installed');
  assert.equal(h.launches.length, 1);
  assert.deepEqual(fs.readFileSync(path.join(path.dirname(approval.planPath), 'native-install-plan.json')), Buffer.from(outer.nativePlan.bytesBase64, 'base64'));
  assert.ok(h.requests.some(r => r.headers.range === 'bytes=16777216-16777238'));
  assert.ok(h.calls.every(call => !call.url.includes('github')));
  assert.equal(h.calls.filter(call => call.url === h.trust.catalogURL).length, 1);
  assert.ok(h.calls.every(call => call.init.headers?.['X-GitHub-Api-Version'] === undefined));
});

test('approved digest, source, embedded native digest and exact mirror mapping cannot drift', async t => {
  const h = await harness(t);
  const approval = await h.plan();
  const original = fs.readFileSync(approval.planPath);
  await assert.rejects(h.helper.runDownload({ ...args(approval), releaseSource: 'github' }, h.environment), e => e.category === 'release_source_mismatch');
  const updated = rewrite(approval, value => { value.transport.assets.installer = 'https://cnb.cool/other/file'; });
  await assert.rejects(h.helper.runDownload(args(approval), h.environment), e => e.category === 'plan_digest_mismatch');
  await assert.rejects(h.helper.runDownload(updated, h.environment), e => e.category === 'transport_drift');
  fs.writeFileSync(approval.planPath, original);
  const changedChild = rewrite(approval, value => { value.nativePlan.bytesBase64 = Buffer.from('{}').toString('base64'); });
  await assert.rejects(h.helper.runDownload(changedChild, h.environment), e => e.category === 'plan_digest_mismatch');
  assert.equal(h.launches.length, 0);
});

test('tampered catalog, unknown key, expired catalog and expired native plan fail before artifact requests', async t => {
  const h = await harness(t);
  const approval = await h.plan();
  const original = fs.readFileSync(approval.planPath);
  for (const [mutate, expected] of [
    [signed => { signed.payload.sourceRevision = 'f'.repeat(40); }, 'catalog_signature_invalid'],
    [signed => { signed.signature.keyId = 'ed25519-sha256:' + '0'.repeat(64); }, 'catalog_signature_invalid'],
    [signed => { signed.payload.issuedAt = new Date(Date.now() - 120000).toISOString(); signed.payload.expiresAt = new Date(Date.now() - 60000).toISOString(); Object.assign(signed, catalog.signCatalog(signed.payload, privateKey, authority)); }, 'catalog_expired'],
  ]) {
    fs.writeFileSync(approval.planPath, original);
    const rewritten = rewrite(approval, value => { const signed = JSON.parse(Buffer.from(value.catalog.bytesBase64, 'base64')); mutate(signed); const bytes = Buffer.from(JSON.stringify(signed)); value.catalog = { bytesBase64: bytes.toString('base64'), sha256: hash(bytes) }; });
    await assert.rejects(h.helper.runDownload(rewritten, h.environment), e => e.category === expected);
  }
  fs.writeFileSync(approval.planPath, original);
  const expired = rewrite(approval, value => { const native = JSON.parse(Buffer.from(value.nativePlan.bytesBase64, 'base64')); native.createdAt = new Date(Date.now() - 120000).toISOString(); native.expiresAt = new Date(Date.now() - 60000).toISOString(); const bytes = Buffer.from(JSON.stringify(native)); value.nativePlan = { bytesBase64: bytes.toString('base64'), sha256: hash(bytes) }; });
  await assert.rejects(h.helper.runDownload(expired, h.environment), e => e.category === 'expired_plan');
  assert.equal(h.calls.length, 6); // Discovery and two metadata assets, each via one redirect.
});

test('new selections reject rollback/equivocation while previous exact approvals keep their lifetime', async t => {
  const h = await harness(t);
  const original = await h.plan();
  h.payload.sequence += 1;
  await h.plan();
  assert.equal((await h.helper.runDownload(args(original), h.environment)).status, 'downloaded');
  h.payload.sequence -= 1;
  await assert.rejects(h.plan(), e => e.category === 'catalog_rollback');
  h.payload.sequence += 1;
  h.payload.sourceRevision = 'c'.repeat(40);
  await assert.rejects(h.plan(), e => e.category === 'catalog_equivocation');
});

test('unsafe redirects, invalid ranges and corrupt complete cache never launch or fall back', async t => {
  const h = await harness(t);
  const approval = await h.plan();
  h.setHandler((req, res, url) => { if (url.pathname.endsWith(h.name)) { res.writeHead(302, { Location: 'https://evil.invalid/package' }); res.end(); return true; } return false; });
  await assert.rejects(h.helper.runDownload(args(approval), h.environment), e => e.category === 'invalid_asset_redirect');
  h.setHandler((req, res) => { if (req.headers.range) { res.end(h.contents.get(h.name)); return true; } return false; });
  await assert.rejects(h.helper.runDownload(args(approval), h.environment), e => e.category === 'asset_download_failed');
  h.setHandler(null);
  assert.equal((await h.helper.runDownload(args(approval), h.environment)).status, 'downloaded');
  fs.writeFileSync(path.join(path.dirname(approval.planPath), h.name), Buffer.alloc(h.contents.get(h.name).length, 1));
  await assert.rejects(h.helper.runExecute(args(approval), h.environment), e => e.category === 'digest_mismatch');
  assert.equal(h.launches.length, 0);
});

test('catalog discovery rejects anonymous-auth failures and unapproved bootstrap redirects distinctly', async t => {
  const h = await harness(t);
  h.setHandler((req, res) => { res.writeHead(401); res.end(); return true; });
  await assert.rejects(h.plan(), e => e.category === 'catalog_authentication_failed');
  h.setHandler((req, res) => { res.writeHead(302, { Location: 'https://github.com/catalog.json' }); res.end(); return true; });
  await assert.rejects(h.plan(), e => e.category === 'blocked_origin');
  assert.equal(h.calls.length, 2);
});


test('expiry reached during execute metadata work cannot renew approval or launch native installer', async t => {
  const h = await harness(t);
  const approval = await h.plan();
  await h.helper.runDownload(args(approval), h.environment);
  const original = fs.readFileSync(approval.planPath);
  // Simulate elapsed time after the final authenticated metadata check; keep
  // the real plan validator, native extraction and spawn boundaries intact.
  vm.runInContext(`
    const originalSourceCheck = assertSourceMatchesPlan;
    let sourceChecks = 0;
    assertSourceMatchesPlan = async (...values) => {
      const result = await originalSourceCheck(...values);
      if (++sourceChecks === 2) {
        const Clock = Date;
        const future = Clock.now() + 31 * 60 * 1000;
        Date = class extends Clock { constructor(...args) { super(...(args.length ? args : [future])); } static now() { return future; } };
      }
      return result;
    };
  `, h.context);
  await assert.rejects(h.helper.runExecute(args(approval), h.environment), error => error.category === 'expired_plan');
  assert.equal(h.launches.length, 0);
  assert.deepEqual(fs.readFileSync(approval.planPath), original);
  assert.equal(fs.existsSync(path.join(path.dirname(approval.planPath), 'native-install-plan.json')), false);
});

test('production loader uses the packaged authority, never a key carried by the catalog', async () => {
  const runtime = Object.create(process);
  runtime.argv = [process.execPath, fileURLToPath(new URL('../skills/jishudb/scripts/install-windows.js', import.meta.url))];
  const sandbox = vm.createContext({ module: { exports: {} }, process: runtime, Buffer, URL });
  vm.runInContext(helperText.replace(/^#![^\n]*\n/, ''), sandbox);
  // The fixture has a valid signature under its own key, but that key is not
  // the independently approved production key shipped alongside the helper.
  await assert.rejects(sandbox.module.exports.verifyMirrorCatalog(fixture().bytes(), {}, { approved: true }),
    error => error.category === 'catalog_signature_invalid');
});

function retainedDataFixture(h) {
  const stateRoot = path.join(h.environment.localAppData, 'JishuDB');
  const dataRoot = path.join(h.root, 'custom-retained-data');
  const bootstrapPath = path.join(stateRoot, 'data-location.json');
  const markerPath = path.join(dataRoot, '.jishudb-data-root');
  const endpointPath = path.join(stateRoot, 'desktop-endpoint.json');
  fs.mkdirSync(stateRoot, { recursive: true });
  fs.mkdirSync(dataRoot);
  const identity = { schemaVersion: 1, product: 'JishuDB', instanceId: 'a'.repeat(32) };
  fs.writeFileSync(bootstrapPath, JSON.stringify({ ...identity, dataRoot }));
  fs.writeFileSync(markerPath, JSON.stringify(identity));
  fs.writeFileSync(endpointPath, '{"localPort":8093,"schemaVersion":1}\n');
  const database = path.join(dataRoot, 'database'); fs.mkdirSync(database);
  const sentinel = path.join(database, 'kb.sqlite'); fs.writeFileSync(sentinel, 'existing data must survive');
  return { dataRoot, bootstrapPath, markerPath, endpointPath, sentinel };
}

test('retained data selects an explicit interactive reinstall and preserves its custom path and identity', async t => {
  const h = await harness(t);
  const retained = retainedDataFixture(h);
  const snapshots = new Map(Object.values(retained).filter(p => fs.statSync(p).isFile()).map(p => [p, fs.readFileSync(p)]));
  const approval = await h.plan();
  assert.equal(approval.approval.operation, 'reinstall-preserve-data');
  assert.equal(approval.approval.launchMode, 'interactive-installer');
  assert.equal(approval.approval.dataRoot, retained.dataRoot);
  assert.equal(approval.approval.mcpUrl, 'http://127.0.0.1:8093/mcp');
  assert.equal((await h.helper.runDownload(args(approval), h.environment)).status, 'downloaded');
  const result = await h.helper.runExecute(args(approval), h.environment);
  assert.equal(result.status, 'user_action_required');
  assert.equal(result.next, 'complete_interactive_reinstall_and_verify_existing_data');
  assert.equal(h.launches.length, 0, 'fresh-only silent installer must never run');
  assert.equal(h.interactiveLaunches.length, 1);
  assert.equal(result.launchStatus, 'requested', 'broker completion does not prove the window is visible');
  assert.deepEqual(Array.from(h.interactiveLaunches[0].args), [result.installerPath], 'the desktop shell receives only the verified installer path, with no silent flags');
  assert.equal(h.interactiveLaunches[0].spawnOptions.shell, false);
  for (const [p, bytes] of snapshots) assert.deepEqual(fs.readFileSync(p), bytes);
  await assert.rejects(h.helper.runExecute(args(approval), h.environment), e => e.category === 'installer_already_started');
  assert.equal(h.interactiveLaunches.length, 1);
});

test('failed desktop shell handoff preserves data and does not retry the installer', async t => {
  const h = await harness(t, { brokerExitCode: 2 });
  const retained = retainedDataFixture(h);
  const before = fs.readFileSync(retained.sentinel);
  const approval = await h.plan();
  await h.helper.runDownload(args(approval), h.environment);
  await assert.rejects(h.helper.runExecute(args(approval), h.environment), e => e.category === 'installer_launch_failed');
  await assert.rejects(h.helper.runExecute(args(approval), h.environment), e => e.category === 'installer_already_started');
  assert.equal(h.interactiveLaunches.length, 1);
  assert.deepEqual(fs.readFileSync(retained.sentinel), before);
});

for (const change of ['dataRoot', 'instanceId', 'bootstrapBytes', 'application']) {
  test(`retained ${change} change does not prevent download and stops installation`, async t => {
    const h = await harness(t); const retained = retainedDataFixture(h);
    const approval = await h.plan();
    if (change === 'application') {
      fs.mkdirSync(approval.approval.applicationRoot, { recursive: true });
      fs.writeFileSync(path.join(approval.approval.applicationRoot, 'JishuDB.exe'), 'existing application');
    }
    else if (change === 'bootstrapBytes') fs.appendFileSync(retained.bootstrapPath, '\n');
    else if (change === 'dataRoot') fs.rmSync(retained.markerPath);
    else {
      const marker = JSON.parse(fs.readFileSync(retained.markerPath)); marker.instanceId = 'b'.repeat(32);
      fs.writeFileSync(retained.markerPath, JSON.stringify(marker));
    }
    assert.equal((await h.helper.runDownload(args(approval), h.environment)).status, 'downloaded');
    await assert.rejects(h.helper.runExecute(args(approval), h.environment), e =>
      ['existing_installation', 'invalid_data_location', 'installation_state_changed'].includes(e.category));
    assert.equal(h.launches.length + h.interactiveLaunches.length, 0);
    assert.equal(fs.readFileSync(retained.sentinel, 'utf8'), 'existing data must survive');
  });
}

test('invalid leftover endpoint is reported during planning without blocking verified download', async t => {
  const h = await harness(t);
  const endpoint = path.join(h.environment.localAppData, 'JishuDB/desktop-endpoint.json');
  fs.mkdirSync(path.dirname(endpoint)); fs.writeFileSync(endpoint, '{');
  const approval = await h.plan();
  assert.equal(approval.approval.preflightWarnings[0].errorCategory, 'invalid_endpoint');
  assert.equal((await h.helper.runDownload(args(approval), h.environment)).status, 'downloaded');
  await assert.rejects(h.helper.runExecute(args(approval), h.environment), e => e.category === 'invalid_endpoint');
  assert.equal(fs.readFileSync(endpoint, 'utf8'), '{');
  assert.equal(h.launches.length + h.interactiveLaunches.length, 0);
});

test('existing application and orphaned data do not block download or authorize overwriting', async t => {
  for (const target of ['Programs/JishuDB', 'Programs/JishuDBData', 'JishuDB/data-location.json']) {
    const h = await harness(t); const filename = path.join(h.environment.localAppData, target);
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    if (target.endsWith('.json')) fs.writeFileSync(filename, '{}'); else fs.mkdirSync(filename);
    const approval = await h.plan();
    assert.equal((await h.helper.runDownload(args(approval), h.environment)).status, 'downloaded');
    await assert.rejects(h.helper.runExecute(args(approval), h.environment), e =>
      ['existing_installation', 'retained_data_requires_review'].includes(e.category));
    assert.ok(fs.existsSync(filename));
    assert.equal(h.launches.length + h.interactiveLaunches.length, 0);
  }
});

test('an occupied retained endpoint allows download but blocks the reinstall wizard', async t => {
  const h = await harness(t); retainedDataFixture(h);
  vm.runInContext('isTcpPortAvailable = async () => false', h.context);
  const approval = await h.plan();
  assert.equal(approval.approval.mcpUrl, 'http://127.0.0.1:8093/mcp');
  assert.equal((await h.helper.runDownload(args(approval), h.environment)).status, 'downloaded');
  await assert.rejects(h.helper.runExecute(args(approval), h.environment), e => e.category === 'endpoint_conflict');
  assert.equal(h.interactiveLaunches.length, 0);
});

test('retained data without an endpoint uses the same legacy port as Desktop', async t => {
  const h = await harness(t); const retained = retainedDataFixture(h);
  fs.unlinkSync(retained.endpointPath);
  vm.runInContext("getFreeDesktopMcpUrl = async () => 'http://127.0.0.1:8090/mcp'", h.context);
  const approval = await h.plan();
  assert.equal(approval.approval.mcpUrl, 'http://127.0.0.1:8088/mcp');
  assert.equal((await h.helper.runDownload(args(approval), h.environment)).status, 'downloaded');
  assert.equal((await h.helper.runExecute(args(approval), h.environment)).status, 'user_action_required');
  assert.equal(fs.existsSync(retained.endpointPath), false);
});

test('removing a retained custom endpoint after approval cannot silently switch the planned port', async t => {
  const h = await harness(t); const retained = retainedDataFixture(h);
  const approval = await h.plan(); fs.unlinkSync(retained.endpointPath);
  assert.equal((await h.helper.runDownload(args(approval), h.environment)).status, 'downloaded');
  await assert.rejects(h.helper.runExecute(args(approval), h.environment), e => e.category === 'endpoint_conflict');
  assert.equal(h.interactiveLaunches.length, 0);
});

test('preserved-data reinstall accepts Python uninstall caches without deleting or changing them', async t => {
  const h = await harness(t); const retained = retainedDataFixture(h);
  const appRoot = path.join(h.environment.localAppData, 'Programs', 'JishuDB');
  const cacheFile = path.join(appRoot, 'resources/runtime/python/Lib/encodings/__pycache__/utf_8.cpython-312.pyc');
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true }); fs.writeFileSync(cacheFile, 'retained bytecode');
  const approval = await h.plan();
  assert.equal((await h.helper.runDownload(args(approval), h.environment)).status, 'downloaded');
  assert.equal((await h.helper.runExecute(args(approval), h.environment)).status, 'user_action_required');
  assert.equal(fs.readFileSync(cacheFile, 'utf8'), 'retained bytecode');
  assert.equal(fs.readFileSync(retained.sentinel, 'utf8'), 'existing data must survive');
  assert.equal(h.launches.length, 0);
  assert.equal(h.interactiveLaunches.length, 1);
});

for (const residue of ['notes.txt', 'resources/runtime/python/Lib/site.py', 'resources/app.asar', 'JishuDB.exe']) {
  test(`preserved-data reinstall does not overwrite ${residue}`, async t => {
    const h = await harness(t); retainedDataFixture(h);
    const file = path.join(h.environment.localAppData, 'Programs/JishuDB', residue);
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, 'must survive');
    const approval = await h.plan();
    assert.equal((await h.helper.runDownload(args(approval), h.environment)).status, 'downloaded');
    await assert.rejects(h.helper.runExecute(args(approval), h.environment), error =>
      ['existing_installation', 'application_state_requires_review'].includes(error.category));
    assert.equal(h.interactiveLaunches.length, 0);
    assert.equal(fs.readFileSync(file, 'utf8'), 'must survive');
  });
}

test('linked Python uninstall caches cannot be admitted as harmless residue', async t => {
  const h = await harness(t); retainedDataFixture(h);
  const file = path.join(h.environment.localAppData, 'Programs/JishuDB/resources/runtime/python/Lib/__pycache__/test.pyc');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const outside = path.join(h.root, 'outside'); fs.writeFileSync(outside, 'must survive'); fs.linkSync(outside, file);
  const approval = await h.plan();
  assert.equal((await h.helper.runDownload(args(approval), h.environment)).status, 'downloaded');
  await assert.rejects(h.helper.runExecute(args(approval), h.environment), error => error.category === 'application_state_requires_review');
  assert.equal(h.interactiveLaunches.length, 0);
  assert.equal(fs.readFileSync(outside, 'utf8'), 'must survive');
});


test('schema 2 renewals preserve native release identity through Windows plan, download and execute', async t => {
  const h = await harness(t);
  const originalPayload = structuredClone(h.payload);
  const originalApproval = await h.plan();
  Object.assign(h.payload, renewCatalogPayload(h.payload));
  const renewalApproval = await h.plan();
  Object.assign(h.payload, renewCatalogPayload(h.payload));
  const latestApproval = await h.plan();
  for (const approval of [originalApproval, renewalApproval, latestApproval]) {
    const outer = JSON.parse(fs.readFileSync(approval.planPath));
    const native = JSON.parse(Buffer.from(outer.nativePlan.bytesBase64, 'base64'));
    assert.equal(native.release.id, originalPayload.canonicalRelease.id);
    assert.equal(native.release.tag, originalPayload.canonicalRelease.tag);
    assert.equal(native.release.targetCommitish, originalPayload.canonicalRelease.targetCommitish);
    assert.equal(native.release.sourceRevision, originalPayload.sourceRevision);
    for (const role of ['installer', 'checksum', 'candidate']) {
      const original = originalPayload.artifacts.find(artifact => artifact.name === native.assets[role].name);
      assert.equal(native.assets[role].id, original.assetId);
      assert.equal(native.assets[role].sha256, original.sha256);
      assert.equal(native.assets[role].url, `https://api.github.com/repos/${catalog.REPOSITORY}/releases/assets/${original.assetId}`);
    }
    const start = h.calls.length;
    assert.equal((await h.helper.runDownload(args(approval), h.environment)).status, 'downloaded');
    const catalogPayload = JSON.parse(Buffer.from(outer.catalog.bytesBase64, 'base64')).payload;
    const generation = catalogPayload.schemaVersion === 2 ? catalogPayload.mirror.releaseTag : `v${catalogPayload.version}`;
    assert.equal(outer.transport.assets.installer,
      `${catalogPayload.mirror.repositoryURL}/-/releases/download/${generation}/${native.assets.installer.name}`);
    assert.deepEqual(h.calls.slice(start).filter(call => new URL(call.url).hostname === 'cnb.cool').map(call => call.url),
      [outer.transport.assets.installer]);
  }
  // All three approvals stay pinned to their own exact publication. Only the
  // newest is executed here; this fixture never executes a real installer.
  assert.equal((await h.helper.runExecute(args(latestApproval), h.environment)).status, 'installed');
  const extracted = JSON.parse(fs.readFileSync(path.join(path.dirname(latestApproval.planPath), 'native-install-plan.json')));
  assert.equal(extracted.release.tag, 'v0.9.9');
  assert.equal(extracted.release.id, 123);
  assert.ok(h.calls.some(call => call.url.includes('/download/v0.9.9-policy.11/')));
  assert.ok(h.calls.some(call => call.url.includes('/download/v0.9.9-policy.12/')));
  assert.ok(h.calls.every(call => !call.url.includes('github')));
  assert.equal(h.calls.some(call => /latest\.yml|latest-mac\.yml|policy-refresh-/.test(call.url)), false);
  assert.equal(h.launches.length, 1);
});

test('schema 2 cannot reinterpret an old native approval or lower the Windows selection floor', async t => {
  const h = await harness(t);
  const schema1 = structuredClone(h.payload);
  const originalApproval = await h.plan();
  Object.assign(h.payload, renewCatalogPayload(h.payload));
  await h.plan();
  const original = fs.readFileSync(originalApproval.planPath);
  const retargeted = rewrite(originalApproval, value => {
    const bytes = h.bytes();
    value.catalog = { bytesBase64: bytes.toString('base64'), sha256: hash(bytes) };
  });
  await assert.rejects(h.helper.runDownload(args(originalApproval), h.environment), error => error.category === 'plan_digest_mismatch');
  await assert.rejects(h.helper.runDownload(retargeted, h.environment), error => error.category === 'transport_drift');
  fs.writeFileSync(originalApproval.planPath, original);
  for (const key of Object.keys(h.payload)) delete h.payload[key];
  Object.assign(h.payload, schema1);
  await assert.rejects(h.plan(), error => error.category === 'catalog_rollback');
  assert.equal((await h.helper.runDownload(args(originalApproval), h.environment)).status, 'downloaded');
});
