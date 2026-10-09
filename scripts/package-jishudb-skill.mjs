#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillRoot = path.join(repositoryRoot, 'skills', 'jishudb');
const expectedFiles = [
  'SKILL.md',
  'references/connection-recovery.md',
  'references/installation-contract.md',
  'scripts/install-macos.zsh',
  'scripts/install-windows.js',
];

function fail(message) {
  throw new Error(`JishuDB Skill package: ${message}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) fail(`${command} failed${result.stderr ? `: ${result.stderr.trim()}` : ''}`);
  return result.stdout?.trim() ?? '';
}

function sha256File(target) {
  return crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
}

function exactSkillFiles() {
  const files = [];
  function walk(directory, prefix = '') {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const relative = path.posix.join(prefix, entry.name);
      const absolute = path.join(directory, entry.name);
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) fail(`symlink is not publishable: ${relative}`);
      if (entry.isDirectory()) walk(absolute, relative);
      else if (entry.isFile()) files.push(relative);
      else fail(`unsupported filesystem entry: ${relative}`);
    }
  }
  walk(skillRoot);
  if (files.join('\n') !== expectedFiles.join('\n')) {
    fail(`file inventory must equal ${expectedFiles.join(', ')}`);
  }
  return files;
}

function parseArgs(argv) {
  let outputDirectory = '';
  let allowDirty = false;
  for (let index = 0; index < argv.length; index += 1) {
    switch (argv[index]) {
      case '--output-dir':
        outputDirectory = argv[++index] ?? '';
        break;
      case '--allow-dirty':
        allowDirty = true;
        break;
      default:
        fail(`unsupported argument ${JSON.stringify(argv[index])}`);
    }
  }
  if (outputDirectory.trim() === '') fail('--output-dir is required');
  return { outputDirectory: path.resolve(outputDirectory), allowDirty };
}

function main() {
  const { outputDirectory, allowDirty } = parseArgs(process.argv.slice(2));
  const files = exactSkillFiles();
  const status = run('git', ['status', '--porcelain', '--untracked-files=all'], { capture: true });
  const dirty = status !== '';
  if (dirty && !allowDirty) fail('release packaging requires a clean worktree');
  const revision = run('git', ['rev-parse', 'HEAD'], { capture: true });
  if (!/^[0-9a-f]{40}$/.test(revision)) fail('source revision is invalid');
  const skill = fs.readFileSync(path.join(skillRoot, 'SKILL.md'), 'utf8');
  const versionMatch = skill.match(/^\s*version:\s*"([0-9]+\.[0-9]+\.[0-9]+)"\s*$/m);
  if (!versionMatch) fail('Skill metadata version is missing');
  const version = versionMatch[1];
  fs.mkdirSync(outputDirectory, { recursive: true, mode: 0o700 });
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'jishudb-skill-package-'));
  try {
    const stagedSkill = path.join(stage, 'jishudb');
    fs.mkdirSync(stagedSkill, { recursive: true, mode: 0o700 });
    for (const relative of files) {
      const source = path.join(skillRoot, relative);
      const destination = path.join(stagedSkill, relative);
      fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
      fs.copyFileSync(source, destination);
      fs.chmodSync(destination, fs.statSync(source).mode & 0o777);
    }
    const artifactName = `jishudb-skill-${version}.tar.gz`;
    const artifactPath = path.join(outputDirectory, artifactName);
    if (fs.existsSync(artifactPath)) fail(`output already exists: ${artifactName}`);
    run('tar', [
      '--sort=name', '--format=ustar', '--mtime=@0', '--owner=0', '--group=0',
      '--numeric-owner', '-czf', artifactPath, '-C', stage, 'jishudb',
    ]);
    const manifest = {
      schemaVersion: 1,
      product: 'jishudb-agent-skill',
      name: 'jishudb',
      version,
      sourceRevision: revision,
      sourceTreeDirty: dirty,
      publicationEligible: !dirty,
      artifact: {
        name: artifactName,
        size: fs.statSync(artifactPath).size,
        sha256: sha256File(artifactPath),
      },
      files: files.map((relative) => ({
        path: relative,
        size: fs.statSync(path.join(skillRoot, relative)).size,
        sha256: sha256File(path.join(skillRoot, relative)),
        mode: (fs.statSync(path.join(skillRoot, relative)).mode & 0o777).toString(8).padStart(3, '0'),
      })),
    };
    const manifestPath = `${artifactPath}.manifest.json`;
    const checksumPath = `${artifactPath}.sha256`;
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    fs.writeFileSync(checksumPath, `${manifest.artifact.sha256}  ${artifactName}\n`, { mode: 0o600, flag: 'wx' });
    process.stdout.write(`${JSON.stringify({ artifactPath, manifestPath, checksumPath, publicationEligible: manifest.publicationEligible })}\n`);
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
