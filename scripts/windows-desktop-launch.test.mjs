import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../skills/jishudb/scripts/install-windows.js', import.meta.url), 'utf8');

function fixture(t, { brokerCode = 1, brokerError, shortcutError, omitClose = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jishudb-shell-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'JishuDB.exe'), 'fixture');
  const calls = [], shortcuts = [];
  const portable = Object.create(process);
  portable.getBuiltinModule = name => name === 'node:child_process' ? {
    spawn(command, args, options) {
      calls.push({ command, args, options });
      const child = new EventEmitter();
      child.kill = () => { calls.push({ killed: true }); };
      queueMicrotask(() => {
        if (brokerError) child.emit('error', brokerError);
        else if (!omitClose) child.emit('close', brokerCode, null);
      });
      return child;
    },
  } : process.getBuiltinModule(name);
  const sandbox = vm.createContext({ process: portable, module: { exports: {} }, Buffer, URL, AbortSignal,
    setTimeout: (fn, delay) => setTimeout(fn, Math.min(delay, 20)), clearTimeout,
    nativeFixture: async (command, args, options) => {
      if (shortcutError) throw shortcutError;
      const script = Buffer.from(args.at(-1), 'base64').toString('utf16le');
      const encoded = /FromBase64String\('([^']+)'\)/.exec(script)[1];
      const data = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
      shortcuts.push({ command, args, options, data });
      fs.writeFileSync(data.shortcutPath, 'fixture shortcut');
      return { status: 0 };
    },
  });
  vm.runInContext(source.replace(/^#![^\n]*\n/, ''), sandbox);
  vm.runInContext(`
    assertNoReparseAncestors = value => path.resolve(value);
    createPrivateDirectory = async target => fs.mkdirSync(target);
    assertPrivateAcl = async () => {};
    setPrivateAcl = async () => {};
    runNative = nativeFixture;
  `, sandbox);
  const context = { identity: { sid: 'fixture' }, tools: { explorer: 'explorer.exe', powershell: 'powershell.exe' } };
  const run = launchMode => sandbox.module.exports.launchInstalledDesktop(
    { installation: { applicationRoot: root }, launchMode }, { transactionRoot: root }, context,
  );
  return { root, calls, shortcuts, run };
}

test('desktop dispatch preserves background intent and waits for the broker without spawning the app directly', async t => {
  const h = fixture(t);
  const result = await h.run('agent-background');
  assert.equal(result.launchStatus, 'requested');
  assert.equal(result.launchMethod, 'desktop-shell');
  assert.equal(h.shortcuts[0].data.arguments, '--jishudb-agent-background');
  assert.equal(h.shortcuts[0].data.application, path.join(h.root, 'JishuDB.exe'));
  assert.equal(h.shortcuts[0].data.workingDirectory, h.root);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].command, 'explorer.exe');
  assert.equal(h.calls[0].args[0], result.shortcutPath);
  assert.equal(h.calls[0].options.shell, false);
  assert.ok(fs.existsSync(result.shortcutPath), 'link remains available for asynchronous Explorer consumption');
  assert.ok(!h.shortcuts[0].args.some(arg => /ExecutionPolicy|Bypass/i.test(arg)));
});

test('foreground approval stays foreground and each dispatch gets a separate private link', async t => {
  const h = fixture(t, { brokerCode: 0 });
  const first = await h.run(undefined), second = await h.run(undefined);
  assert.equal(h.shortcuts[0].data.arguments, '');
  assert.notEqual(first.shortcutPath, second.shortcutPath);
});

test('shortcut creation failure preserves its cause and never tries a direct-child fallback', async t => {
  const cause = new Error('COM creation denied');
  const h = fixture(t, { shortcutError: cause });
  await assert.rejects(h.run('agent-background'), e => e.category === 'desktop_launch_failed' && e.cause === cause);
  assert.equal(h.calls.length, 0);
});

test('broker start, exit and timeout failures never claim successful dispatch', async t => {
  const cause = Object.assign(new Error('access denied'), { code: 'EACCES' });
  const start = fixture(t, { brokerError: cause });
  await assert.rejects(start.run(), e => e.category === 'desktop_launch_failed' && e.cause === cause);
  const exit = fixture(t, { brokerCode: 5 });
  await assert.rejects(exit.run(), e => e.category === 'desktop_launch_failed' && /exited with 5/.test(e.cause.message));
  const timeout = fixture(t, { omitClose: true });
  await assert.rejects(timeout.run(), e => e.category === 'desktop_launch_failed' && /timed out/.test(e.cause.message));
  assert.equal(timeout.calls.at(-1).killed, true);
});
