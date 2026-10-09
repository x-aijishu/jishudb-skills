import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = process.env.COVER_RENDERER_SCRIPT || fileURLToPath(new URL(
  '../skills/xiaohongshu-content-factory/scripts/render-cover.cjs', import.meta.url,
));
const { validateSpec } = createRequire(import.meta.url)(script);

test('cover specs reject invalid content rather than silently dropping it', () => {
  assert.equal(validateSpec({ title: '电脑连接开发板' }).title, '电脑连接开发板');
  for (const invalid of [null, [], {}, { title: ' ' }, { title: 'x'.repeat(81) },
    { title: 'x', points: ['1', '2', '3', '4', '5'] }, { title: 'x', points: [''] },
    { title: 'x', accent: 'red' }, { title: 'x', executable: 'unexpected' }]) {
    assert.throws(() => validateSpec(invalid));
  }
});

test('cover CLI reports malformed invocation with a failing process status', () => {
  const result = spawnSync(process.execPath, [script, '--input'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.equal(JSON.parse(result.stderr).status, 'failed');
});

test('installed canvas exports a real PNG, protects revisions, and rejects overflow', t => {
  const check = spawnSync(process.execPath, [script, '--check'], { encoding: 'utf8' });
  if (check.status !== 0) {
    t.skip('Requires an installed compatible node-canvas; run on the target host.');
    return;
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jishu-cover-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const input = path.join(directory, 'spec.json');
  const output = path.join(directory, 'cover.png');
  const run = target => spawnSync(process.execPath, [script, '--input', input, '--output', target], { encoding: 'utf8' });
  fs.writeFileSync(input, JSON.stringify({ title: '电脑连接开发板', points: ['检查数据线', '确认驱动和串口'] }));
  const rendered = run(output);
  assert.equal(rendered.status, 0, rendered.stderr);
  const bytes = fs.readFileSync(output);
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(bytes.readUInt32BE(16), 1080);
  assert.equal(bytes.readUInt32BE(20), 1440);
  assert.ok(bytes.length > 1000);
  assert.equal(run(output).status, 1);
  assert.deepEqual(fs.readFileSync(output), bytes);
  fs.writeFileSync(input, JSON.stringify({ title: 'Overflow check', subtitle: '板'.repeat(160) }));
  const overflow = path.join(directory, 'overflow.png');
  const failed = run(overflow);
  assert.equal(failed.status, 1);
  assert.match(JSON.parse(failed.stderr).error, /does not fit/);
  assert.equal(fs.existsSync(overflow), false);
});
