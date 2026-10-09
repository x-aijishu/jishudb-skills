import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { recordingIdentity } from '../skills/jishudb-plaud-import/scripts/recording-identity.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const skillNames = [
  'ppt-rescue-kit',
  'xiaohongshu-content-factory',
  'polished-website-builder',
  'interview-crash-coach',
  'industry-report-sprint',
  'research-report-hunter',
  'data-evidence-finder',
  'end-to-end-industry-presentations',
  'report-to-content-factory',
  'industry-opportunity-radar',
  'jishudb-plaud-import',
];
const contract = JSON.parse(fs.readFileSync(
  path.join(repositoryRoot, 'docs', 'contracts', 'jishudb-mcp-v2.json'),
  'utf8',
));
const toolNames = new Set(contract.tools.map((tool) => tool.name));
const identityScript = path.join(repositoryRoot, 'skills', 'jishudb-plaud-import', 'scripts', 'recording-identity.mjs');

function markdownFiles(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name);
    assert.equal(entry.isSymbolicLink(), false, `Package must not depend on a symlink: ${filename}`);
    if (entry.isDirectory()) {
      files.push(...markdownFiles(filename));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(filename);
    }
  }
  return files;
}

function assertLocalLinks(packageRoot, filename, source) {
  const prose = source.replace(/```[^\n]*\n[\s\S]*?```/g, '');
  for (const match of prose.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = match[1];
    if (target.startsWith('#') || /^https?:\/\//.test(target)) continue;
    const localPath = decodeURIComponent(target.split('#')[0]);
    const resolved = path.resolve(path.dirname(filename), localPath);
    const relative = path.relative(packageRoot, resolved);
    assert.ok(
      relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative),
      `${filename} links outside its independently installed package: ${target}`,
    );
    assert.ok(fs.existsSync(resolved), `${filename} has a missing reference: ${target}`);
  }
}

for (const name of skillNames) {
  test(`${name} has a standalone entrypoint and real MCP tool references`, () => {
    const packageRoot = path.join(repositoryRoot, 'skills', name);
    const entrypoint = path.join(packageRoot, 'SKILL.md');
    const source = fs.readFileSync(entrypoint, 'utf8');
    const frontmatter = source.match(/^---\n([\s\S]*?)\n---\n/);
    assert.ok(frontmatter, `${name} needs YAML frontmatter`);
    assert.match(frontmatter[1], new RegExp(`^name: ${name}$`, 'm'));
    assert.match(frontmatter[1], /^description: \S.+$/m);
    assert.match(frontmatter[1], /^compatibility: \S.+$/m);
    assert.match(frontmatter[1], /^metadata:\n/m);
    assert.match(frontmatter[1], /^  version: ["']?\d+\.\d+\.\d+["']?$/m);
    assert.ok(source.endsWith('\n'), `${name} needs a final newline`);

    const referencedTools = new Set();
    for (const filename of markdownFiles(packageRoot)) {
      const text = fs.readFileSync(filename, 'utf8');
      assertLocalLinks(packageRoot, filename, text);
      for (const match of text.matchAll(/\b(?:kb|note)_[a-z][a-z0-9_]*\b/g)) {
        assert.ok(toolNames.has(match[0]), `${filename} names an unknown JishuDB tool: ${match[0]}`);
        referencedTools.add(match[0]);
      }
    }
    for (const required of ['kb_get_capabilities', 'kb_get_config', 'kb_list', 'kb_get_document']) {
      assert.ok(referencedTools.has(required), `${name} omits ${required}`);
    }
    assert.ok(
      ['kb_prepare_upload', 'kb_upload', 'kb_import_url', 'note_create'].some((tool) => referencedTools.has(tool)),
      `${name} has no concrete persistence operation`,
    );
    assert.ok(
      ['kb_read_document_text', 'note_get'].some((tool) => referencedTools.has(tool)),
      `${name} has no saved-content readback operation`,
    );
    if (referencedTools.has('note_create')) {
      assert.ok(referencedTools.has('note_link_to_kb'), `${name} creates Notes without linking them to a KB`);
    }
  });
}

test('Plaud identities preserve the fixed source, Note UUID, and transfer-key contract', () => {
  const input = {
    accountScope: 'account-a',
    recordingId: 'recording-a',
    kbId: 'project-a',
    representation: 'audio',
    contentSha256: 'a'.repeat(64),
  };
  const expected = {
    externalAssetId: 'plaud:6dfa2c6400556acc62878f7cf1a0731586c8fad5ecff8b6e3e95ddd4a349a93c',
    manifestNoteId: 'e1eec151-2485-5a8a-a2ba-987f0e070890',
    idempotencyKey: 'plaud-65f9ec94b36209b5994da81040262b0d811bf91a84cfe2023f9b125b2a32108c',
  };
  assert.deepEqual(recordingIdentity(input), expected);
  assert.deepEqual(recordingIdentity({ ...input }), expected);
  for (const field of ['accountScope', 'recordingId', 'kbId']) {
    const changed = recordingIdentity({ ...input, [field]: `${input[field]}-other` });
    assert.notEqual(changed.manifestNoteId, expected.manifestNoteId);
    assert.notEqual(changed.idempotencyKey, expected.idempotencyKey);
    if (field === 'kbId') assert.equal(changed.externalAssetId, expected.externalAssetId);
    else assert.notEqual(changed.externalAssetId, expected.externalAssetId);
  }
  for (const change of [{ representation: 'transcript' }, { contentSha256: 'b'.repeat(64) }]) {
    const changed = recordingIdentity({ ...input, ...change });
    assert.equal(changed.externalAssetId, expected.externalAssetId);
    assert.equal(changed.manifestNoteId, expected.manifestNoteId);
    assert.notEqual(changed.idempotencyKey, expected.idempotencyKey);
  }
  const preliminary = recordingIdentity({
    kbId: input.kbId, recordingId: input.recordingId, accountScope: input.accountScope,
  });
  assert.deepEqual(preliminary, {
    externalAssetId: expected.externalAssetId,
    manifestNoteId: expected.manifestNoteId,
  });
});

test('Plaud identity CLI validates bounded input without echoing private identifiers', () => {
  const valid = { accountScope: 'private-account', recordingId: 'private-recording', kbId: 'project-a' };
  const success = spawnSync(process.execPath, [identityScript], {
    input: JSON.stringify(valid), encoding: 'utf8',
  });
  assert.equal(success.status, 0, success.stderr);
  assert.deepEqual(JSON.parse(success.stdout), recordingIdentity(valid));
  assert.equal(success.stderr, '');
  assert.doesNotMatch(success.stdout, /private-account|private-recording/);

  for (const input of [
    '{private-account',
    JSON.stringify({ ...valid, token: 'private-account' }),
    JSON.stringify({ ...valid, accountScope: 'private-account'.repeat(1000) }),
    JSON.stringify({ ...valid, representation: 'audio' }),
    JSON.stringify({ ...valid, representation: 'audio', contentSha256: 'invalid-private-digest' }),
    JSON.stringify({ ...valid, representation: 'video', contentSha256: 'a'.repeat(64) }),
    Buffer.from([0xff, 0xfe]),
  ]) {
    const failure = spawnSync(process.execPath, [identityScript], { input, encoding: 'utf8' });
    assert.equal(failure.status, 2);
    assert.equal(failure.stdout, '');
    assert.match(failure.stderr, /^Invalid recording identity:/);
    assert.doesNotMatch(failure.stderr, /private-account|private-recording|invalid-private-digest/);
  }
  const argumentsFailure = spawnSync(process.execPath, [identityScript, 'private-account'], {
    input: JSON.stringify(valid), encoding: 'utf8',
  });
  assert.equal(argumentsFailure.status, 2);
  assert.equal(argumentsFailure.stdout, '');
  assert.doesNotMatch(argumentsFailure.stderr, /private-account/);
});

test('the MCP acceptance Skill references the current generated contract digest', () => {
  const packageRoot = path.join(repositoryRoot, 'skills', 'jishudb-mcp-check');
  for (const relative of [
    'SKILL.md',
    'references/contract-baseline.md',
    'references/report-template.md',
  ]) {
    const source = fs.readFileSync(path.join(packageRoot, relative), 'utf8');
    assert.ok(source.includes(contract.contractDigest), `${relative} has a stale contract baseline`);
  }
});
