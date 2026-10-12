import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import test from 'node:test';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jishudb-proxy-tests-'));
const helperPath = path.join(root, 'helper.cjs');
fs.copyFileSync(new URL('../skills/jishudb/scripts/install-windows.js', import.meta.url), helperPath);
const helper = createRequire(import.meta.url)(helperPath);
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

const fakeRuntime = env => ({ env, execPath: '/node', argv: ['/node', '/helper.cjs'], execArgv: [],
  allowedNodeEnvironmentFlags: new Set(['--use-env-proxy']) });

test('absent proxy configuration leaves the process and environment alone', () => {
  const env = { PATH: 'unchanged', NO_PROXY: '.internal' };
  assert.equal(helper.downloadProxyEnvironment(env), null);
  assert.equal(helper.runWithDownloadProxy(['check'], fakeRuntime(env), () => { throw new Error('must not spawn'); }), null);
  assert.deepEqual(env, { PATH: 'unchanged', NO_PROXY: '.internal' });
});

test('proxy preparation preserves user exclusions, lower-case precedence and loopback bypass', () => {
  const env = { HTTPS_PROXY: 'http://upper:8080', https_proxy: 'http://lower:8081',
    NO_PROXY: '.upper', no_proxy: '.internal,127.0.0.1', KEEP: 'value' };
  const result = helper.downloadProxyEnvironment(env);
  assert.equal(result.HTTPS_PROXY, 'http://lower:8081');
  assert.equal(result.https_proxy, undefined);
  assert.equal(result.NODE_USE_ENV_PROXY, '1');
  assert.equal(result.NO_PROXY, '.internal,127.0.0.1,localhost,::1,[::1]');
  assert.equal(result.KEEP, 'value');
  assert.equal(env.no_proxy, '.internal,127.0.0.1');
  assert.equal(helper.downloadProxyEnvironment({ HTTP_PROXY: 'http://proxy', NO_PROXY: '*' }).NO_PROXY, '*,localhost,127.0.0.1,::1,[::1]');
});

test('invalid or unsupported proxies fail without exposing proxy credentials', () => {
  for (const url of ['socks5://user:secret@proxy:1080', 'http://user:secret@proxy/path', 'bad-secret-value']) {
    assert.throws(() => helper.downloadProxyEnvironment({ HTTPS_PROXY: url }), e =>
      e.category === 'invalid_proxy_configuration' && !e.message.includes('secret'));
  }
  const runtime = fakeRuntime({ HTTPS_PROXY: 'http://proxy:8080' });
  runtime.allowedNodeEnvironmentFlags.clear();
  assert.throws(() => helper.runWithDownloadProxy(['check'], runtime), e => e.category === 'unsupported_proxy_runtime');
});

test('one scoped restart enables startup proxy handling and passes credentials only through env', () => {
  const runtime = fakeRuntime({ HTTPS_PROXY: 'http://user:secret@proxy:8080', NO_PROXY: '.internal' });
  runtime.execArgv = ['--no-use-env-proxy'];
  let childRuntime;
  const status = helper.runWithDownloadProxy(['download', '-PlanPath', 'C:\\plan.json', '-PlanSha256', 'a'.repeat(64)], runtime,
    (command, args, options) => {
      assert.equal(command, '/node');
      assert.deepEqual(args.slice(0, 2), ['--use-env-proxy', '/helper.cjs']);
      assert.equal(args.some(value => value.includes('secret')), false);
      assert.equal(options.env.HTTPS_PROXY, runtime.env.HTTPS_PROXY);
      assert.equal(options.shell, false);
      assert.equal(options.stdio, 'inherit');
      childRuntime = { ...runtime, env: options.env, execArgv: ['--use-env-proxy'] };
      return { status: 7 };
    });
  assert.equal(status, 7);
  assert.equal(helper.runWithDownloadProxy(['check'], childRuntime, () => { throw new Error('recursive restart'); }), null);
  assert.equal(runtime.env.NODE_USE_ENV_PROXY, undefined);
});

test('restart errors preserve their category and child environment remains isolated from Desktop', () => {
  const runtime = fakeRuntime({ HTTPS_PROXY: 'http://user:secret@proxy:8080' });
  const cause = Object.assign(new Error('process creation denied'), { code: 'EACCES' });
  assert.throws(() => helper.runWithDownloadProxy(['check'], runtime, () => ({ error: cause })),
    e => e.category === 'proxy_helper_launch_failed' && e.cause === cause);
  assert.throws(() => helper.runWithDownloadProxy(['check'], runtime, () => ({ signal: 'SIGTERM' })),
    e => e.category === 'proxy_helper_interrupted');
  const env = helper.sanitizedChildEnvironment(helper.downloadProxyEnvironment({ ...runtime.env, LOCALAPPDATA: 'C:\\Local' }));
  assert.equal(env.HTTPS_PROXY, undefined);
  assert.equal(env.NODE_USE_ENV_PROXY, undefined);
  assert.equal(env.LOCALAPPDATA, 'C:\\Local');
  assert.equal(helper.redactDiagnostic('connect https://user:secret@proxy:8080/path'), 'connect https://<redacted>@proxy:8080/path');
});

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function runChild(file, env, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('proxy transport probe timed out')); }, 15000);
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
}

for (const proxyKeys of [['HTTP_PROXY', 'HTTPS_PROXY'], ['HTTP_PROXY'], ['HTTPS_PROXY']]) {
test(`real Node fetch uses ${proxyKeys.join('/')} for HTTPS while loopback stays direct`, async t => {
  assert.equal(process.allowedNodeEnvironmentFlags.has('--use-env-proxy'), true, 'transport test requires proxy-capable Node');
  const connections = [];
  const proxy = http.createServer((_req, res) => { res.writeHead(502); res.end(); });
  proxy.on('connect', (req, socket) => {
    connections.push({ host: req.url, auth: req.headers['proxy-authorization'] });
    socket.end('HTTP/1.1 407 Proxy Authentication Required\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
  });
  const directPaths = [];
  const target = http.createServer((req, res) => { directPaths.push(req.url); res.end('local-ok'); });
  t.after(() => { proxy.closeAllConnections(); proxy.close(); target.closeAllConnections(); target.close(); });
  const proxyPort = await listen(proxy), targetPort = await listen(target);
  const probe = path.join(root, 'transport-probe.cjs');
  fs.writeFileSync(probe, `
    const helper = require('./helper.cjs');
    (async () => {
      const status = helper.runWithDownloadProxy(process.argv.slice(2));
      if (status !== null) { process.exitCode = status; return; }
      for (const [host, fn] of [['metadata.example.invalid', helper.fetchWithTimeout], ['asset.example.invalid', helper.requestDownload]]) {
        let failed = false;
        try { await fn('https://' + host + '/file', { signal: AbortSignal.timeout(2500) }, 2500); } catch { failed = true; }
        if (!failed) throw new Error('fixture proxy should reject CONNECT');
      }
      for (const host of ['127.0.0.1', 'localhost']) {
        const response = await helper.requestDownload('http://' + host + ':' + process.argv[2] + '/health', { signal: AbortSignal.timeout(2500) });
        if (await response.text() !== 'local-ok') throw new Error('loopback did not reach the local service');
      }
      console.log('proxy-and-loopback-ok');
    })().catch(error => { console.error(error.message); process.exitCode = 1; });
  `);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/proxy|^node_options$/i.test(key)));
  for (const key of proxyKeys) env[key] = `http://test-user:test-password@127.0.0.1:${proxyPort}`;
  env.NO_PROXY = '.internal';
  const result = await runChild(probe, env, [String(targetPort)]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'proxy-and-loopback-ok');
  assert.deepEqual(connections.map(c => c.host), ['metadata.example.invalid:443', 'asset.example.invalid:443']);
  assert.ok(connections.every(c => c.auth === `Basic ${Buffer.from('test-user:test-password').toString('base64')}`));
  assert.deepEqual(directPaths, ['/health', '/health']);
});
}
