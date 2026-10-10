import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const sourceRoot = path.join(repositoryRoot, 'skills', 'research-report-hunter');
const packageRoot = path.join(repositoryRoot, '.github', 'skills', 'research-report-hunter');

function packageFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    assert.equal(entry.isSymbolicLink(), false, `Package must not depend on a symlink: ${entry.name}`);
    if (entry.isDirectory()) {
      files.push(...packageFiles(path.join(directory, entry.name)).map((file) => path.join(entry.name, file)));
    } else if (entry.isFile()) {
      files.push(entry.name);
    }
  }
  return files.sort();
}

test('Copilot research-report-hunter preserves the complete source package unchanged', () => {
  const files = packageFiles(sourceRoot);
  assert.deepEqual(packageFiles(packageRoot), files);
  for (const file of files) {
    assert.deepEqual(
      fs.readFileSync(path.join(packageRoot, file)),
      fs.readFileSync(path.join(sourceRoot, file)),
      `Copied package differs from source: ${file}`,
    );
    if (process.platform !== 'win32') {
      assert.equal(
        fs.statSync(path.join(packageRoot, file)).mode & 0o777,
        fs.statSync(path.join(sourceRoot, file)).mode & 0o777,
        `Copied file permissions differ: ${file}`,
      );
    }
  }
  const entrypoint = fs.readFileSync(path.join(packageRoot, 'SKILL.md'), 'utf8');
  assert.match(entrypoint, /^---\nname: research-report-hunter\n/);
});

test('Copilot research-report-hunter relative Markdown links resolve inside the package', () => {
  for (const file of packageFiles(packageRoot).filter((file) => file.endsWith('.md'))) {
    const filename = path.join(packageRoot, file);
    const prose = fs.readFileSync(filename, 'utf8').replace(/```[^\n]*\n[\s\S]*?```/g, '');
    for (const match of prose.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const target = match[1];
      if (target.startsWith('#') || /^https?:\/\//.test(target)) continue;
      const resolved = path.resolve(path.dirname(filename), decodeURIComponent(target.split('#')[0]));
      const relative = path.relative(packageRoot, resolved);
      assert.ok(
        relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative),
        `${file} links outside the copied package: ${target}`,
      );
      assert.ok(fs.existsSync(resolved), `${file} has a missing reference: ${target}`);
    }
  }
});
