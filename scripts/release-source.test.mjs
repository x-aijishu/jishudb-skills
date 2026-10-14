import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import test from 'node:test';
import vm from 'node:vm';

const windowsPath = new URL('../skills/jishudb/scripts/install-windows.js', import.meta.url);
const windows = readFileSync(windowsPath, 'utf8');
const macos = readFileSync(new URL('../skills/jishudb/scripts/install-macos.zsh', import.meta.url), 'utf8');
const module = { exports: {} };
vm.runInNewContext(windows.replace(/^#![^\n]*\n/, ''), { module, process, URL });
const helper = module.exports;

for (const mode of ['plan', 'download', 'execute']) {
  test(`Windows ${mode} parses source selection without implicit override`, () => {
    assert.equal(helper.parseArguments([mode]).releaseSource, mode === 'plan' ? 'cnb' : null);
    assert.equal(helper.parseArguments([mode, '-ReleaseSource', 'github']).releaseSource, 'github');
    assert.equal(helper.parseArguments([mode, '-ReleaseSource', 'cnb']).releaseSource, 'cnb');
  });
}

test('Windows rejects unknown and duplicate source options without fallback', () => {
  for (const value of ['', 'CNB', 'https://cnb.cool/example', 'auto']) {
    assert.throws(() => helper.assertReleaseSourceAvailable(value), error => error.category === 'invalid_release_source');
  }
  assert.throws(() => helper.parseArguments(['plan', '-ReleaseSource', 'cnb', '-ReleaseSource', 'github']), /duplicate/);
  assert.throws(() => helper.parseArguments(['check', '-ReleaseSource', 'cnb']), /not valid in check mode/);
  assert.equal(helper.assertReleaseSourceAvailable(), 'cnb');
});

test('direct Windows transaction entrypoints reject unknown source selectors', async () => {
  for (const operation of [helper.runDownload, helper.runExecute]) {
    await assert.rejects(operation({ releaseSource: 'auto' }), error => error.category === 'invalid_release_source');
  }
});

test('macOS defaults new plans to CNB but defers existing transaction source checks', () => {
  const initialSource = macos.match(/^RELEASE_SOURCE="([^"]+)"/m)?.[1];
  const dispatch = macos.slice(macos.lastIndexOf('# Existing transactions resolve'));
  assert.ok(dispatch.includes('run_download'));
  for (const [mode, source, specified, expected] of [
    ['plan', initialSource, 0, 'gate:cnb\nplan:cnb\n'],
    ['plan', 'github', 1, 'gate:github\nplan:github\n'],
    ['download', initialSource, 0, 'gate:github\ndownload:github\n'],
    ['execute', initialSource, 0, 'gate:github\nexecute:github\n'],
  ]) {
    const script = `MODE="$1"; RELEASE_SOURCE="$2"; RELEASE_SOURCE_SPECIFIED="$3"
assert_release_source_available() { printf 'gate:%s\\n' "$RELEASE_SOURCE"; }
run_plan() { printf 'plan:%s\\n' "$RELEASE_SOURCE"; }
run_download() { RELEASE_SOURCE=github; assert_release_source_available; printf 'download:%s\\n' "$RELEASE_SOURCE"; }
run_execute() { RELEASE_SOURCE=github; assert_release_source_available; printf 'execute:%s\\n' "$RELEASE_SOURCE"; }
${dispatch}`;
    const result = spawnSync('bash', ['-c', script, 'source-dispatch', mode, source, String(specified)], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, expected);
  }
});

test('macOS source gate requires complete CNB verification resources and rejects unknown values', () => {
  const gate = macos.match(/assert_release_source_available\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(gate);
  assert.match(macos, /assert_release_source_available\nfi\n\nif \[\[ "\$MODE" == "plan"/);
  // This gate uses POSIX shell syntax. Run the exact function under bash on
  // Linux; the full zsh/JXA installer still requires real macOS acceptance.
  const scriptRoot = new URL('../skills/jishudb/scripts/', import.meta.url).pathname;
  for (const [source, category, root = scriptRoot] of [['github', ''], ['cnb', ''],
    ['cnb', 'release_source_not_configured', '/nonexistent-cnb-package'], ['', 'invalid_release_source'], ['auto', 'invalid_release_source']]) {
    const result = spawnSync('bash', ['-c', `${gate}\nfail() { printf '%s' "$1"; exit 1; }\nRELEASE_SOURCE="$1"\nSCRIPT_ROOT="$2"\nassert_release_source_available`, 'source-test', source, root], { encoding: 'utf8' });
    assert.equal(result.status, category ? 1 : 0);
    assert.equal(result.stdout, category);
  }
});
