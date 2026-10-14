import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../skills/jishudb/scripts/install-windows.js', import.meta.url), 'utf8');

function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'private-acl-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const identity = { sid: 'S-1-5-21-1-2-3-1001', account: 'test\\owner' };
  const state = { calls: [], inherited: true, explicit: false, ...options };
  const runtime = Object.create(process);
  runtime.getBuiltinModule = name => name === 'node:fs' && options.unlinkError
    ? { ...fs, unlinkSync() { throw options.unlinkError; } } : process.getBuiltinModule(name);
  const sandbox = vm.createContext({ process: runtime, Buffer, URL, AbortSignal,
    setTimeout, clearTimeout, module: { exports: {} }, fixture: state });
  vm.runInContext(source.replace(/^#![^\n]*\n/, ''), sandbox);
  vm.runInContext(`
    assertNoReparseAncestors = value => value;
    runNative = async (command, args) => {
      fixture.calls.push([...args]);
      const action = args[1];
      if (fixture.failAction && action === fixture.failAction) {
        fixture.beforeFailure?.(args[0]);
        throw fixture.failure;
      }
      if (action === '/grant:r') fixture.explicit = true;
      if (action === '/inheritancelevel:r') fixture.inherited = false;
      if (!fixture.explicit && !fixture.inherited) throw new Error('Owner access was removed');
      return { stdout: action ? '' : args[0] + ' S-1-5-21-1-2-3-1001:(F)', stderr: '', status: 0 };
    };
  `, sandbox);
  const helper = vm.runInContext('({writePrivateFileExclusive, acquireDownloadLock})', sandbox);
  return { root, state, helper, context: { identity, tools: { icacls: 'icacls.exe' } } };
}

test('ACL hardening retains owner access while removing inheritance', async t => {
  const h = fixture(t);
  const unlock = await h.helper.acquireDownloadLock(h.root, h.context);
  assert.equal(h.state.explicit, true);
  assert.equal(h.state.inherited, false);
  assert.match(fs.readFileSync(path.join(h.root, 'download.lock'), 'utf8'), /"pid":/);
  await unlock();
  assert.equal(fs.existsSync(path.join(h.root, 'download.lock')), false);
});

for (const action of ['/grant:r', '/inheritancelevel:r', '/remove:g', '/setowner', '/verify']) {
  test(`failed ${action} removes this invocation's lock and permits a fresh retry`, async t => {
    const failure = Object.assign(new Error('native ACL failure'), { category: 'native_command_failed' });
    const h = fixture(t, { failAction: action, failure });
    await assert.rejects(h.helper.acquireDownloadLock(h.root, h.context), error => error === failure);
    assert.equal(fs.existsSync(path.join(h.root, 'download.lock')), false);
    h.state.failAction = undefined;
    const unlock = await h.helper.acquireDownloadLock(h.root, h.context);
    await unlock();
  });
}

test('exclusive-open failure preserves a pre-existing lock and never edits its ACL', async t => {
  const h = fixture(t);
  const lock = path.join(h.root, 'download.lock');
  fs.writeFileSync(lock, 'another invocation');
  await assert.rejects(h.helper.acquireDownloadLock(h.root, h.context), error => error.category === 'download_locked');
  assert.equal(fs.readFileSync(lock, 'utf8'), 'another invocation');
  assert.equal(h.state.calls.length, 0);
});

test('cleanup refuses to delete a replacement at the failed lock path', async t => {
  const failure = new Error('ACL failure after replacement');
  const h = fixture(t, { failAction: '/remove:g', failure, beforeFailure(target) {
    fs.renameSync(target, `${target}.original`);
    fs.writeFileSync(target, 'replacement from another invocation');
  } });
  await assert.rejects(h.helper.acquireDownloadLock(h.root, h.context), error => error === failure);
  assert.equal(fs.readFileSync(path.join(h.root, 'download.lock'), 'utf8'), 'replacement from another invocation');
  assert.equal(failure.cleanup.errorCategory, 'cleanup_identity_changed');
});

test('cleanup failure preserves the original error and reports separate recovery evidence', async t => {
  const failure = Object.assign(new Error('ACL command rejected'), { category: 'native_command_failed' });
  const h = fixture(t, { failAction: '/remove:g', failure,
    unlinkError: Object.assign(new Error('cleanup access denied'), { code: 'EACCES' }) });
  await assert.rejects(h.helper.acquireDownloadLock(h.root, h.context), error => error === failure);
  assert.equal(failure.category, 'native_command_failed');
  assert.equal(failure.cleanup.status, 'manual_recovery_required');
  assert.equal(failure.cleanup.errorCategory, 'EACCES');
  assert.equal(fs.existsSync(path.join(h.root, 'download.lock')), true);
});
