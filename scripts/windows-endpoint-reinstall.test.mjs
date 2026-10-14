import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../skills/jishudb/scripts/install-windows.js', import.meta.url), 'utf8');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

function harness(t, { occupied = [], afterInstall, launchError } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jishudb-endpoint-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const environment = { localAppData: root, tempRoot: root, identity: { sid: 'fixture' }, tools: { explorer: path.join(root, 'explorer.exe') } };
  const installation = { applicationRoot: path.join(root, 'Programs/JishuDB'), dataRoot: path.join(root, 'Programs/JishuDBData'), bootstrapPath: path.join(root, 'JishuDB/data-location.json') };
  const endpoint = path.join(root, 'JishuDB/desktop-endpoint.json');
  const calls = [];
  const runtimeProcess = Object.create(process);
  runtimeProcess.getBuiltinModule = name => name !== 'node:child_process' ? process.getBuiltinModule(name) : {
    spawnSync() {
      calls.push('install');
      for (const filename of [path.join(installation.applicationRoot, 'JishuDB.exe'), path.join(installation.applicationRoot, 'resources/runtime/jishudb.exe'), installation.bootstrapPath]) {
        fs.mkdirSync(path.dirname(filename), { recursive: true });
        fs.writeFileSync(filename, 'fixture receipt');
      }
      fs.mkdirSync(installation.dataRoot, { recursive: true });
      afterInstall?.({ endpoint, installation });
      return { status: 0 };
    },
    spawn() {
      calls.push('launch');
      const child = new EventEmitter();
      child.unref = () => {};
      queueMicrotask(() => launchError ? child.emit('error', launchError) : child.emit('close', 1, null));
      return child;
    },
  };
  const sandbox = vm.createContext({ AbortSignal, Buffer, URL, console, process: runtimeProcess,
    setTimeout, clearTimeout, module: { exports: {} }, fetch: () => { throw new Error('unexpected network request'); },
    endpointFixture: { occupied },
  });
  vm.runInContext(source.replace(/^#![^\n]*\n/, ''), sandbox);
  // Real filesystem, JSON parsing and execute ordering; Windows path syntax,
  // ACL tooling, native installer and upstream trust checks are separate suites.
  vm.runInContext(`
    assertWindowsX64 = () => {};
    assertNoReparseAncestors = target => path.resolve(target);
    normalizeLocalWindowsPath = target => path.resolve(target);
    setPrivateAcl = () => {};
    assertPrivateAcl = () => {};
    isTcpPortAvailable = async port => !endpointFixture.occupied.includes(port);
    createPrivateDirectory = target => fs.mkdirSync(target);
    createDesktopShortcut = async target => fs.writeFileSync(target, 'fixture shortcut');
  `, sandbox);
  const helper = sandbox.module.exports;
  function save(value = { schemaVersion: 1, localPort: 8088 }) {
    fs.mkdirSync(path.dirname(endpoint), { recursive: true });
    fs.writeFileSync(endpoint, typeof value === 'string' ? value : JSON.stringify(value));
  }
  function prepareExecute() {
    const transactionRoot = path.join(root, 'transaction');
    fs.mkdirSync(transactionRoot);
    const name = 'JishuDB-Windows-x64-0.9.9-Setup.exe';
    const installer = Buffer.from('fixture installer, never executed');
    const candidate = Buffer.from(JSON.stringify({ revision: 'a'.repeat(40) }));
    const checksum = Buffer.from(`${sha256(installer)}  ${name}\n`);
    const assets = {};
    for (const [role, filename, bytes] of [['installer', name, installer], ['candidate', name + '.candidate.json', candidate], ['checksum', name + '.sha256', checksum]]) {
      fs.writeFileSync(path.join(transactionRoot, filename), bytes);
      assets[role] = { role, name: filename, size: bytes.length, sha256: sha256(bytes) };
    }
    const plan = { installation, assets, connection: { url: 'http://127.0.0.1:8088/mcp' }, release: { version: '0.9.9', sourceRevision: 'a'.repeat(40) } };
    sandbox.approvedFixture = { plan, transactionRoot, resolvedPlan: path.join(transactionRoot, 'plan.json'), source: null };
    vm.runInContext(`
      loadApprovedPlan = () => approvedFixture;
      assertSourceMatchesPlan = async () => {};
      validateWindowsCandidate = () => {};
      validatePlan = () => {};
    `, sandbox);
    return () => helper.runExecute({ releaseSource: 'github', planSha256: 'b'.repeat(64) }, environment);
  }
  return { helper, root, environment, installation, endpoint, save, calls, prepareExecute };
}

test('reinstallation preserves a valid saved endpoint byte for byte and selects its port', async t => {
  const h = harness(t);
  h.save('{\r\n  "localPort": 8093,\r\n  "schemaVersion": 1\r\n}\r\n');
  const before = fs.readFileSync(h.endpoint);
  const url = await h.helper.selectInstallationEndpoint(h.installation.bootstrapPath);
  assert.equal(url, 'http://127.0.0.1:8093/mcp');
  h.helper.assertFreshInstallationDestinations(h.installation);
  await h.helper.writeDesktopEndpointConfig(h.installation.bootstrapPath, url, h.environment);
  assert.deepEqual(fs.readFileSync(h.endpoint), before);
});

test('fresh endpoint creation remains exclusive and subsequent reuse is idempotent', async t => {
  const h = harness(t, { occupied: [8088] });
  const url = await h.helper.selectInstallationEndpoint(h.installation.bootstrapPath);
  assert.equal(url, 'http://127.0.0.1:8090/mcp');
  await h.helper.writeDesktopEndpointConfig(h.installation.bootstrapPath, url, h.environment);
  await h.helper.writeDesktopEndpointConfig(h.installation.bootstrapPath, url, h.environment);
  assert.deepEqual(JSON.parse(fs.readFileSync(h.endpoint)), { localPort: 8090, schemaVersion: 1 });
});

for (const [name, value] of [
  ['malformed JSON', '{'], ['empty file', ''], ['oversized file', ' '.repeat(4097)],
  ['array', '[]'], ['future schema', { schemaVersion: 2, localPort: 8088 }],
  ['extra field', { schemaVersion: 1, localPort: 8088, token: 'fixture' }],
  ['string port', { schemaVersion: 1, localPort: '8088' }],
  ['reserved LAN port', { schemaVersion: 1, localPort: 8089 }],
  ['unapproved port', { schemaVersion: 1, localPort: 18095 }],
]) {
  test(`rejects ${name} without overwriting the retained endpoint`, async t => {
    const h = harness(t); h.save(value);
    const before = fs.readFileSync(h.endpoint);
    await assert.rejects(h.helper.selectInstallationEndpoint(h.installation.bootstrapPath), error => error.category === 'invalid_endpoint');
    assert.deepEqual(fs.readFileSync(h.endpoint), before);
  });
}

test('rejects linked endpoint files and directories', async t => {
  const h = harness(t); h.save();
  fs.renameSync(h.endpoint, h.endpoint + '.target');
  fs.linkSync(h.endpoint + '.target', h.endpoint);
  assert.throws(() => h.helper.readSavedDesktopEndpoint(h.installation.bootstrapPath), error => error.category === 'invalid_endpoint');
  fs.unlinkSync(h.endpoint);
  if (process.platform !== 'win32') {
    fs.symlinkSync(h.endpoint + '.target', h.endpoint);
    assert.throws(() => h.helper.readSavedDesktopEndpoint(h.installation.bootstrapPath), error => error.category === 'invalid_endpoint');
    fs.unlinkSync(h.endpoint);
  }
  fs.mkdirSync(h.endpoint);
  assert.throws(() => h.helper.readSavedDesktopEndpoint(h.installation.bootstrapPath), error => error.category === 'invalid_endpoint');
});

test('busy saved port remains downloadable but blocks execute before installer activity', async t => {
  const h = harness(t, { occupied: [8088] }); h.save();
  assert.equal(await h.helper.selectInstallationEndpoint(h.installation.bootstrapPath), 'http://127.0.0.1:8088/mcp');
  await assert.rejects(h.prepareExecute()(), error => error.category === 'endpoint_conflict');
  assert.deepEqual(h.calls, []);
});

test('retained application, data or data-location cannot be overwritten through fresh execute', async t => {
  for (const key of ['applicationRoot', 'dataRoot', 'bootstrapPath']) {
    const h = harness(t);
    fs.mkdirSync(path.dirname(h.installation[key]), { recursive: true });
    if (key === 'bootstrapPath') fs.writeFileSync(h.installation[key], '{}');
    else fs.mkdirSync(h.installation[key]);
    await assert.rejects(h.prepareExecute()(), error => error.category === (key === 'applicationRoot' ? 'existing_installation' : 'retained_data_requires_review'));
    assert.ok(fs.existsSync(h.installation[key]));
  }
});

test('execute installs and launches with an unchanged pre-uninstall endpoint', async t => {
  const h = harness(t); h.save();
  const before = fs.readFileSync(h.endpoint);
  const result = await h.prepareExecute()();
  assert.equal(result.status, 'installed');
  assert.deepEqual(h.calls, ['install', 'launch']);
  assert.deepEqual(fs.readFileSync(h.endpoint), before);
});

test('changed endpoint is rejected before running the installer', async t => {
  const h = harness(t); h.save({ schemaVersion: 1, localPort: 8093 });
  await assert.rejects(h.prepareExecute()(), error => error.category === 'endpoint_conflict' && !error.installation);
  assert.deepEqual(h.calls, []);
});

test('post-install endpoint conflict reports completed installation and never launches or deletes it', async t => {
  const h = harness(t, { afterInstall: ({ endpoint }) => fs.writeFileSync(endpoint, '{"schemaVersion":1,"localPort":8093}') });
  await assert.rejects(h.prepareExecute()(), error => {
    assert.equal(error.category, 'endpoint_conflict');
    assert.equal(error.installation.status, 'installer_completed');
    assert.equal(error.installation.next, 'verify_existing_installation_before_launch');
    return true;
  });
  assert.deepEqual(h.calls, ['install']);
  assert.ok(fs.existsSync(h.installation.dataRoot));
  assert.equal(JSON.parse(fs.readFileSync(h.endpoint)).localPort, 8093);
});

test('launch failure preserves its original error and reports the installed state', async t => {
  const cause = Object.assign(new Error('fixture launch failed'), { code: 'EACCES' });
  const h = harness(t, { launchError: cause });
  await assert.rejects(h.prepareExecute()(), error => error.category === 'desktop_launch_failed' && error.cause === cause && error.installation.status === 'installer_completed');
  assert.deepEqual(h.calls, ['install', 'launch']);
  assert.ok(fs.existsSync(h.installation.dataRoot));
});
