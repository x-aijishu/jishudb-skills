import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../skills/jishudb/scripts/install-windows.js', import.meta.url), 'utf8');
const runtime = Object.create(process);
let synchronousCalls = 0;
runtime.getBuiltinModule = name => name === 'node:child_process' ? {
  ...childProcess,
  spawnSync() { synchronousCalls++; throw Object.assign(new Error('synchronous pipes unavailable'), { code: 'EBUSY' }); },
} : process.getBuiltinModule(name);
const sandbox = vm.createContext({ process: runtime, module: { exports: {} }, Buffer, URL, setTimeout, clearTimeout });
vm.runInContext(source.replace(/^#![^\n]*\n/, ''), sandbox);
// Path security has native Windows coverage; allow portable child-process tests.
vm.runInContext('assertNoReparseAncestors = target => target', sandbox);
const helper = sandbox.module.exports;
const run = (script, options) => helper.runNative(process.execPath, ['-e', script], options);

test('captures trusted command output without synchronous pipes or a shell', async () => {
  const result = await run('process.stdout.write("account\\n"); process.stderr.write("diagnostic\\n")');
  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'account\n');
  assert.equal(result.stderr, 'diagnostic\n');
  assert.equal(synchronousCalls, 0);
});

test('nonzero native exits preserve the operation category and stderr diagnostic', async () => {
  await assert.rejects(run('process.stderr.write("access denied"); process.exit(5)', { label: 'inspect ACL', category: 'invalid_permissions' }), error =>
    error.category === 'invalid_permissions' && error.publicMessage.includes('inspect ACL failed: access denied'));
});

test('native launch failures keep the OS cause and never retry synchronously', async () => {
  await assert.rejects(helper.runNative(path.join(os.tmpdir(), 'missing-native-command-'+process.pid, 'whoami.exe'), [], { label: 'whoami' }), error =>
    error.category === 'native_command_start_failed' && error.cause?.code === 'ENOENT' && error.publicMessage.includes('ENOENT'));
  assert.equal(synchronousCalls, 0);
});

test('native commands have a bounded deadline', async () => {
  await assert.rejects(run('setInterval(() => {}, 1000)', { timeoutMilliseconds: 100 }), error => error.category === 'native_command_timeout');
});

test('combined stdout and stderr are bounded and the excessive-output process is stopped', async () => {
  await assert.rejects(run('process.stdout.write("a".repeat(400)); process.stderr.write("b".repeat(400)); setInterval(() => {}, 1000)', { maxBuffer: 512 }), error => error.category === 'native_command_output_limit');
});
