import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import test from 'node:test';
import vm from 'node:vm';

const helperSource = readFileSync(
  new URL('../skills/jishudb/scripts/install-windows.js', import.meta.url),
  'utf8',
);

function loadHelper() {
  const source = helperSource.replace(/^#![^\n]*\n/, '');
  const module = { exports: {} };
  vm.runInNewContext(source, {
    AbortSignal,
    Buffer,
    URL,
    console,
    fetch,
    module,
    process,
    setTimeout,
    clearTimeout,
  }, { filename: 'install-windows.js' });
  return module.exports;
}

const helper = loadHelper();
const digest = (character) => `sha256:${character.repeat(64)}`;

function release({ version, id, immutable = true }) {
  const installer = `JishuDB-Windows-x64-${version}-Setup.exe`;
  const asset = (assetId, name, value) => ({
    id: assetId,
    name,
    size: 10 + assetId,
    state: 'uploaded',
    digest: digest(value),
    url: `https://api.github.com/repos/x-aijishu/jishudb-desktop-releases/releases/assets/${assetId}`,
  });
  return {
    id,
    tag_name: `v${version}`,
    target_commitish: 'main',
    draft: false,
    prerelease: false,
    immutable,
    assets: [
      asset(id * 10 + 1, installer, 'a'),
      asset(id * 10 + 2, `${installer}.sha256`, 'b'),
      asset(id * 10 + 3, `${installer}.candidate.json`, 'c'),
    ],
  };
}

test('pure JavaScript helper parses only the reviewed command surface', () => {
  assert.deepEqual(
    { ...helper.parseArguments(['plan', '-Client', 'WorkBuddy', '-ConfigTarget', 'C:\\config.json']) },
    {
      mode: 'plan',
      planPath: '',
      planSha256: '',
      client: 'WorkBuddy',
      configTarget: 'C:\\config.json',
      connectionName: 'jishudb',
    },
  );
  assert.throws(() => helper.parseArguments(['plan', '-Client', 'one', '-Client', 'two']), /duplicate argument/);
  assert.throws(() => helper.parseArguments(['check', '-Client', 'unexpected']), /not valid in check mode|accepts no additional/);
  assert.throws(() => helper.parseArguments(['execute', '-Client', 'unexpected']), /not valid in execute mode/);
  assert.throws(() => helper.parseArguments(['repair']), /first argument/);
});

test('pure JavaScript helper keeps the bounded Desktop endpoint set', () => {
  assert.deepEqual(Array.from(helper.approvedDesktopMcpPorts()), [
    8088, 8090, 8091, 8092, 8093, 8094, 8095, 8096,
    8097, 8098, 8099, 8100, 8101, 8102, 8103, 8104,
  ]);
  assert.equal(helper.isDesktopMcpUrl('http://127.0.0.1:8088/mcp'), true);
  assert.equal(helper.isDesktopMcpUrl('http://127.0.0.1:8089/mcp'), false);
  assert.equal(helper.isDesktopMcpUrl('http://localhost:8088/mcp'), false);
  assert.equal(helper.isDesktopMcpUrl('http://127.0.0.1:8088/mcp?token=x'), false);
});

test('Windows path validation rejects UNC, device, and alternate data stream paths', () => {
  assert.equal(helper.normalizeLocalWindowsPath('C:\\Users\\tester\\file.json', 'path'), 'C:\\Users\\tester\\file.json');
  assert.throws(() => helper.normalizeLocalWindowsPath('\\\\server\\share\\file', 'path'), /local-drive path/);
  assert.throws(() => helper.normalizeLocalWindowsPath('\\\\?\\C:\\Temp\\file', 'path'), /local-drive path/);
  assert.throws(() => helper.normalizeLocalWindowsPath('C:\\Temp\\file:stream', 'path'), /alternate-data-stream/);
  assert.throws(() => helper.normalizeLocalWindowsPath('C:\\Temp\\NUL.txt', 'path'), /unsupported Windows path component/);
  assert.throws(() => helper.normalizeLocalWindowsPath('C:\\Temp\\COM¹.txt', 'path'), /unsupported Windows path component/);
  assert.throws(() => helper.normalizeLocalWindowsPath('C:\\Temp\\LPT².json', 'path'), /unsupported Windows path component/);
  assert.throws(() => helper.normalizeLocalWindowsPath('C:\\Temp\\bad?.json', 'path'), /unsupported Windows path component/);
});

test('release pagination preserves a one-item page and enforces the page bound', async () => {
  const releases = await helper.getReleasePages(async (page) => [{ page }]);
  assert.deepEqual(Array.from(releases, (item) => item.page), [1]);
  await assert.rejects(
    helper.getReleasePages(async () => Array.from({ length: 100 }, () => ({}))),
    (error) => error.category === 'pagination_bound',
  );
});

test('release selection uses numeric SemVer and rejects mutable releases', async () => {
  const selected = await helper.selectEligibleRelease(async () => [
    release({ version: '9.0.0', id: 9, immutable: false }),
    release({ version: '1.9.0', id: 19 }),
    release({ version: '1.10.0', id: 110 }),
  ]);
  assert.equal(selected.version, '1.10.0');
  assert.equal(selected.release.id, 110);
  assert.equal(helper.parseSemver(`1.${'9'.repeat(100)}.0`), null);
});

test('asset redirect validation accepts only the reviewed GitHub host and path', () => {
  const source = new URL('https://api.github.com/repos/x-aijishu/jishudb-desktop-releases/releases/assets/123');
  assert.equal(helper.isAllowedAssetRedirect(
    source,
    new URL('https://release-assets.githubusercontent.com/github-production-release-asset/1316997274/file'),
  ), true);
  assert.equal(helper.isAllowedAssetRedirect(source, new URL('https://example.com/file')), false);
  assert.equal(helper.isAllowedAssetRedirect(
    source,
    new URL('https://release-assets.githubusercontent.com/other/file'),
  ), false);
});

test('icacls parsing isolates the explicit account entry from localized summary text', () => {
  const target = 'C:\\Users\\tester\\AppData\\Local\\Temp\\plan.json';
  const entries = helper.parseIcaclsEntries(
    `${target} S-1-5-21-1-2-3-1001:(F)\r\nSuccessfully processed 1 files; Failed processing 0 files\r\n`,
    target,
  );
  assert.deepEqual(Array.from(entries, (entry) => ({ ...entry })), [
    { identity: 'S-1-5-21-1-2-3-1001', rights: '(F)' },
  ]);
});

test('private ACL validation rejects deny, inherited, and extra entries', () => {
  const identity = { account: 'DOMAIN\\tester', sid: 'S-1-5-21-1-2-3-1001' };
  const allowedFile = [{ identity: identity.account, rights: '(F)' }];
  const allowedDirectory = [{ identity: identity.account, rights: '(OI)(CI)(F)' }];
  assert.equal(helper.isPrivateAclEntries(allowedFile, false, identity), true);
  assert.equal(helper.isPrivateAclEntries(allowedDirectory, true, identity), true);
  assert.equal(helper.isPrivateAclEntries([
    ...allowedDirectory,
    { identity: 'Mandatory Label\\High Mandatory Level', rights: '(OI)(CI)(NW)' },
  ], true, identity), true);
  assert.equal(helper.isPrivateAclEntries([
    ...allowedDirectory,
    { identity: 'Mandatory Label\\High Mandatory Level', rights: '(OI)(CI)(F)' },
  ], true, identity), false);
  assert.equal(helper.isPrivateAclEntries([{ identity: identity.account, rights: '(DENY)(F)' }], false, identity), false);
  assert.equal(helper.isPrivateAclEntries([{ identity: identity.account, rights: '(I)(F)' }], false, identity), false);
  assert.equal(helper.isPrivateAclEntries([{ identity: identity.account, rights: '(OI)(CI)(IO)(F)' }], true, identity), false);
  assert.equal(helper.isPrivateAclEntries([{ identity: identity.account, rights: '(OI)(CI)(NP)(F)' }], true, identity), false);
  assert.equal(helper.isPrivateAclEntries([
    ...allowedFile,
    { identity: 'BUILTIN\\Administrators', rights: '(F)' },
  ], false, identity), false);
  assert.match(helperSource, /\/remove:g', '\*S-1-5-18', '\*S-1-5-32-544'/);
});

test('Windows candidate validation preserves the unsigned per-user contract', () => {
  const selected = {
    version: '1.2.3',
    installer: release({ version: '1.2.3', id: 12 }).assets[0],
  };
  const candidate = {
    artifact: {
      name: selected.installer.name,
      sha256: selected.installer.digest.slice(7),
      size: selected.installer.size,
    },
    authorization: { mode: 'windows-fresh-install-v1', publisherIdentity: 'none' },
    bundleIdentifier: 'com.aijishu.jishudb',
    distribution: {
      authenticode: 'not-signed',
      installationScope: 'current-user',
      mode: 'per-user-nsis-v1',
      publisherIdentity: 'none',
      smartScreenAssessment: 'unknown-publisher-manual-approval-required',
    },
    minimumSystemVersion: '10.0.22000',
    product: 'jishudb-desktop',
    productName: 'JishuDB',
    publication: { requested: true },
    revision: 'd'.repeat(40),
    runtimeLock: {
      path: 'packaging/windows/desktop-runtime-lock.json',
      sha256: 'e'.repeat(64),
    },
    schemaVersion: 1,
    source: { repository: 'x-aijishu/jishudb', runAttempt: 1, runId: '123' },
    target: 'windows-x64',
    version: '1.2.3',
  };
  helper.validateWindowsCandidate(candidate, selected, '10.0.26100');
  helper.validateWindowsCandidate({...candidate,agentBackgroundLaunch:1},selected,'10.0.26100');
  for (const unsupported of [true,0,2,'1']) assert.throws(()=>helper.validateWindowsCandidate({...candidate,agentBackgroundLaunch:unsupported},selected,'10.0.26100'),/unsupported Agent launch contract/);
  assert.throws(
    () => helper.validateWindowsCandidate({ ...candidate, publication: { requested: false } }, selected, '10.0.26100'),
    /candidate source, artifact, distribution, or authorization is invalid/,
  );
});

test('diagnostics redact signed URL query values', () => {
  assert.equal(
    helper.redactDiagnostic('download?token=secret&x=1&sig=value'),
    'download?token=<redacted>&x=<redacted>&sig=<redacted>',
  );
  assert.equal(helper.redactDiagnostic('Authorization: Bearer secret'), 'Authorization: Bearer <redacted>');
});

test('installer and Desktop child environments exclude agent credentials and Node hooks', () => {
  assert.deepEqual(
    { ...helper.sanitizedChildEnvironment({
      SystemRoot: 'C:\\Windows',
      PATH: 'C:\\Windows\\System32',
      TEMP: 'C:\\Temp',
      API_TOKEN: 'secret',
      JISHUDB_SERVICE_BEARER: 'secret',
      NODE_OPTIONS: '--require malicious.js',
      ELECTRON_RUN_AS_NODE: '1',
    }) },
    {
      SystemRoot: 'C:\\Windows',
      PATH: 'C:\\Windows\\System32',
      TEMP: 'C:\\Temp',
    },
  );
});

test('Windows CI keeps production reparse checks strict while using a local temp root', () => {
  const windowsCheckScript = readFileSync(new URL('./windows-check.ps1', import.meta.url), 'utf8');
  assert.match(windowsCheckScript, /Join-Path \$env:LOCALAPPDATA "Temp"/);
  assert.match(windowsCheckScript, /\$OriginalTemp = \$env:TEMP/);
  assert.match(windowsCheckScript, /\$env:TEMP = \$SkillTempRoot/);
  assert.match(windowsCheckScript, /\$env:TEMP = \$OriginalTemp/);
  assert.match(windowsCheckScript, /\$env:TMP = \$OriginalTmp/);
  assert.doesNotMatch(windowsCheckScript, /\$env:TEMP\s*=\s*\$env:RUNNER_TEMP/);
});
