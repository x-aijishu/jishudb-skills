import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('./package-jishudb-skill.mjs', import.meta.url));
const repositoryRoot = path.resolve(path.dirname(script), '..');

function packageSkill(output) {
  const result = spawnSync(process.execPath, [script, '--output-dir', output, '--allow-dirty'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('Skill package is deterministic and binds every reviewed file', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jishudb-skill-package-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const first = packageSkill(path.join(root, 'first'));
  const second = packageSkill(path.join(root, 'second'));
  const firstBytes = fs.readFileSync(first.artifactPath);
  const secondBytes = fs.readFileSync(second.artifactPath);
  assert.deepEqual(firstBytes, secondBytes);
  const manifest = JSON.parse(fs.readFileSync(first.manifestPath, 'utf8'));
  assert.equal(manifest.product, 'jishudb-agent-skill');
  assert.equal(manifest.name, 'jishudb');
  assert.equal(manifest.version, '0.1.14');
  assert.equal(manifest.publicationEligible, !manifest.sourceTreeDirty);
  assert.deepEqual(manifest.files.map((entry) => entry.path), [
    'SKILL.md',
    'references/connection-recovery.md',
  'references/installation-contract.md',
    'scripts/install-macos.zsh',
    'scripts/install-windows.js',
  ]);
  assert.equal(
    manifest.artifact.sha256,
    crypto.createHash('sha256').update(firstBytes).digest('hex'),
  );
  assert.equal(
    fs.readFileSync(first.checksumPath, 'utf8'),
    `${manifest.artifact.sha256}  ${manifest.artifact.name}\n`,
  );
});

test('release packaging rejects a dirty worktree without an explicit local-test override', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jishudb-skill-package-dirty-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const clone = path.join(root, 'repository');
  fs.mkdirSync(path.join(clone, 'scripts'), { recursive: true });
  fs.cpSync(path.join(repositoryRoot, 'skills', 'jishudb'), path.join(clone, 'skills', 'jishudb'), { recursive: true });
  fs.copyFileSync(script, path.join(clone, 'scripts', 'package-jishudb-skill.mjs'));
  const initResult = spawnSync('git', ['init', '--quiet', clone], { encoding: 'utf8' });
  assert.equal(initResult.status, 0, initResult.stderr);
  fs.writeFileSync(path.join(clone, 'dirty-marker'), 'dirty\n');
  const cloneScript = path.join(clone, 'scripts', 'package-jishudb-skill.mjs');
  const result = spawnSync(process.execPath, [cloneScript, '--output-dir', path.join(root, 'output')], {
    encoding: 'utf8',
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /clean worktree/);
});
