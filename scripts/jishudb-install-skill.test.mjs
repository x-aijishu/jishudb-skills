import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';

function readRepositoryText(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
}

const skill = readRepositoryText('../skills/jishudb/SKILL.md');
const contract = readRepositoryText('../skills/jishudb/references/installation-contract.md');
const macos = readRepositoryText('../skills/jishudb/scripts/install-macos.zsh');
const windows = readRepositoryText('../skills/jishudb/scripts/install-windows.js');

test('installation Skill routes through deterministic plan and execute helpers', () => {
  assert.match(skill, /^name: jishudb$/m);
  assert.match(skill, /^description: >-/m);
  assert.match(skill, /scripts\/install-macos\.zsh/);
  assert.match(skill, /scripts\/install-windows\.js/);
  assert.match(skill, /run the Node helper's `check` mode/);
  assert.match(skill, /Then run the helper in `plan` mode/);
  assert.match(skill, /Show the helper's complete redacted approval envelope and ask once/);
  assert.match(skill, /If no eligible immutable stable release exists, return `BLOCKED`/);
  assert.match(skill, /Never ask for a token in chat/);
	assert.match(skill, /desktop-endpoint\.json/);
	assert.match(skill, /browser OAuth is the default when both endpoints verify support/);
	assert.match(skill, /present OAuth as the recommended default[\s\S]*?Token as the explicit alternative/);
	assert.match(skill, /If[\s\S]*?user does not select Token[\s\S]*?configure only the non-secret MCP URL/);
	assert.match(skill, /Use a manual `jkm_` Token only when the user explicitly selects Token or the[\s\S]*?client is proven not to support OAuth/);
	assert.match(skill, /Do not direct the user to create `jkm_` first/);
	assert.match(skill, /another machine on the same Wi-Fi[\s\S]*?manual `jkm_` Token/);
	assert.match(skill, /must never silently downgrade to a manual Token/);
	assert.doesNotMatch(skill, /first-administrator creation, scoped-token entry/);
	assert.doesNotMatch(skill, /Direct the signed-in administrator to Settings -> MCP connections for current\s+manual `jkm_` creation/);
});

test('installation contract fixes repositories, API version, redirect host, and bounded MCP targets', () => {
  for (const expected of [
    'x-aijishu/jishudb-desktop-releases',
    'x-aijishu/jishudb',
    '2026-03-10',
    'release-assets.githubusercontent.com',
    'jishudb-agent-install-plan-v1',
  ]) {
    assert.match(contract, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(contract, /one `302`/);
  assert.match(contract, /never\s+follow redirects/i);
  assert.match(contract, /greatest numeric SemVer/);
	assert.match(contract, /fallback is bounded to `8090` through `8104`/);
	assert.match(contract, /`8089` reserved for LAN MCP/);
});

test('macOS helper preserves the supply-chain and OS-presence boundaries', () => {
  if (process.platform !== 'win32') {
    assert.equal(statSync(new URL('../skills/jishudb/scripts/install-macos.zsh', import.meta.url)).mode & 0o111, 0o111);
  }
  assert.match(macos, /readonly API_ORIGIN="https:\/\/api\.github\.com"/);
  assert.match(macos, /readonly ASSET_REDIRECT_HOST="release-assets\.githubusercontent\.com"/);
  assert.match(macos, /--max-redirs 0/);
  assert.match(macos, /const targetUser = unwrap\(target\.user\) \|\| '';/);
  assert.match(macos, /const targetPassword = unwrap\(target\.password\) \|\| '';/);
  assert.match(macos, /const targetFragment = unwrap\(target\.fragment\) \|\| '';/);
  assert.doesNotMatch(macos, /unwrap\(target\.(?:user|password|fragment) \|\| ''\)/);
  assert.doesNotMatch(macos, /--location|curl[^\n]*\s-L(?:\s|\\)/);
  assert.match(macos, /hdiutil attach -readonly -nobrowse/);
  assert.match(macos, /ditto --rsrc --extattr/);
  assert.match(macos, /find -P "\$bundle" -type l -print0/);
  assert.match(macos, /readlink "\$link"/);
  assert.match(macos, /jxa resolve-path "\$\{link:h\}\/\$\{target\}"/);
  assert.match(macos, /mounted application bundle/);
  assert.match(macos, /staged application bundle/);
  assert.match(macos, /installed application bundle/);
  assert.match(macos, /absolute or empty symlink/);
  assert.match(macos, /dangling symlink/);
  assert.match(macos, /escaping symlink/);
  assert.doesNotMatch(macos, /application bundle contains a symlink/);
  assert.doesNotMatch(macos, /--noqtn|xattr\s+-d|spctl\s+--master-disable/);
  assert.match(macos, /plan SHA-256 does not match the approved digest/);
  assert.match(macos, /release changed during download/);
  assert.doesNotMatch(macos, /repos\/\$\{SOURCE_REPOSITORY\}\/commits/);
  assert.doesNotMatch(macos, /source_revision_missing/);
  assert.match(macos, /--header 'User-Agent:'[\s\\]*\n\s*--output "\$destination"/);
  assert.match(macos, /local http_status/);
  assert.doesNotMatch(macos, /\blocal\s+status\b/);
	assert.match(macos, /select_mcp_url\(\)/);
	assert.match(macos, /write_endpoint_config\(\)/);
	assert.match(macos, /requireDesktopMCPURL/);
	assert.doesNotMatch(macos, /readonly MCP_URL=/);
});

test('Windows helper rejects redirect, plan, and privilege drift', () => {
  assert.match(windows, /const MAXIMUM_RELEASE_PAGES = 5/);
  assert.match(windows, /redirect: 'manual'/);
  assert.match(windows, /whoami\.exe/);
  assert.match(windows, /icacls\.exe/);
  assert.match(windows, /\/inheritancelevel:r/);
  assert.match(windows, /fs\.openSync\(destination, 'wx'/);
  assert.match(windows, /no eligible immutable stable Windows release is available/);
  assert.match(windows, /plan SHA-256 does not match the approved digest/);
  assert.match(windows, /release identity or immutable state changed/);
  assert.doesNotMatch(windows, /source_revision_missing/);
  assert.match(windows, /\/JISHUDB_AGENT_PLAN=/);
  assert.match(windows, /childProcess\.spawnSync\(installerPath/);
  assert.match(windows, /shell: false/);
  assert.match(windows, /async function getFreeDesktopMcpUrl/);
  assert.match(windows, /function writeDesktopEndpointConfig/);
  assert.match(windows, /function isDesktopMcpUrl/);
  assert.doesNotMatch(windows, /PowerShell|\.ps1|Invoke-Expression|ExecutionPolicy|shell:\s*true|\beval\(/);
});

test('embedded macOS release planner selects numeric SemVer and rejects mutable releases', (t) => {
  const root = mkdtempSync(path.join(tmpdir(), 'jishudb-install-jxa-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const embedded = macos.match(/<<'JXA'\n([\s\S]*?)\nJXA\n/);
  assert.ok(embedded, 'embedded JXA helper is missing');
  const nodeCompatible = embedded[1]
    .replace("ObjC.import('Foundation');", "const fs = require('node:fs');")
    .replace(
      /function readText\(path\) \{[\s\S]*?\n\}\n\nfunction readJSON/,
      'function readText(path) { return fs.readFileSync(path, \'utf8\'); }\n\nfunction readJSON',
    );
  const runner = path.join(root, 'planner.cjs');
  writeFileSync(
    runner,
    `${nodeCompatible}\nprocess.stdout.write(String(run(process.argv.slice(2))));\n`,
  );

  const digest = (character) => `sha256:${character.repeat(64)}`;
  const release = ({ version, id, immutable = true }) => {
    const installer = `jishudb-desktop-${version}-unsigned-darwin-arm64.dmg`;
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
  };
  const releasesPath = path.join(root, 'releases.json');
  writeFileSync(releasesPath, JSON.stringify([
    release({ version: '9.0.0', id: 9, immutable: false }),
    release({ version: '1.9.0', id: 19 }),
    release({ version: '1.10.0', id: 110 }),
  ]));
  const selected = spawnSync(process.execPath, [runner, 'select', releasesPath], {
    encoding: 'utf8',
  });
  assert.equal(selected.status, 0, selected.stderr);
  const value = JSON.parse(selected.stdout);
  assert.equal(value.version, '1.10.0');
  assert.equal(value.release.id, 110);
  assert.equal(value.installer.name, 'jishudb-desktop-1.10.0-unsigned-darwin-arm64.dmg');
  const selectedPath = path.join(root, 'selected.json');
  writeFileSync(selectedPath, selected.stdout);
  const candidatePath = path.join(root, 'candidate.json');
  writeFileSync(candidatePath, JSON.stringify({
    artifact: { name: value.installer.name, sha256: value.installer.digest.slice(7) },
    authorization: {
      compensatingControls: ['local user presence'],
      localUserPresence: { firstAdmin: true, migration: true, recovery: true },
      mode: 'unsigned-local-user-presence-v1',
      publisherIdentity: 'none',
      risk: 'unsigned publisher identity',
    },
    bundleIdentifier: 'com.aijishu.jishudb',
    distribution: {
      adHocIntegritySeal: 'runtime-macho-then-whole-app-v1',
      gatekeeperAssessment: 'manual-required',
      mode: 'unsigned-dmg-v1',
      notarization: 'not-applicable',
      publisherIdentity: 'none',
    },
    minimumSystemVersion: '13.3',
    nativeFileCount: 1,
    product: 'jishudb-desktop',
    productName: 'JishuDB',
    revision: 'd'.repeat(40),
    runtimeLockSha256: 'e'.repeat(64),
    schemaVersion: 2,
    source: { repository: 'x-aijishu/jishudb', runAttempt: 1, runId: '123' },
    target: 'darwin-arm64',
    version: value.version,
  }));
  const candidate = spawnSync(process.execPath, [runner, 'candidate', candidatePath, selectedPath], {
    encoding: 'utf8',
  });
  assert.equal(candidate.status, 0, candidate.stderr);
  assert.equal(candidate.stdout, 'ok');
  for (const background of [false,true]) {
    const document = JSON.parse(readFileSync(candidatePath,'utf8'));
    if (background) document.agentBackgroundLaunch=1;
    writeFileSync(candidatePath,JSON.stringify(document));
    const planned=spawnSync(process.execPath,[runner,'create-plan',selectedPath,candidatePath,'501','/Users/test/Applications/JishuDB.app','/Users/test/Library/Application Support/JishuDB','Client','/Users/test/client.json','jishudb','http://127.0.0.1:8088/mcp'],{encoding:'utf8'});
    assert.equal(planned.status,0,planned.stderr);
    const plan=JSON.parse(planned.stdout);
    assert.equal(plan.schema,background?'jishudb-agent-install-plan-v2':'jishudb-agent-install-plan-v1');
    assert.equal(plan.launchMode,background?'agent-background':undefined);
    const planPath=path.join(root,'launch-plan.json');writeFileSync(planPath,planned.stdout);
    assert.equal(spawnSync(process.execPath,[runner,'validate-plan',planPath,'501'],{encoding:'utf8'}).status,0);
    assert.equal(spawnSync(process.execPath,[runner,'candidate-plan',candidatePath,planPath],{encoding:'utf8'}).status,0);
    plan.schema=background?'jishudb-agent-install-plan-v1':'jishudb-agent-install-plan-v2';
    writeFileSync(planPath,JSON.stringify(plan));
    assert.notEqual(spawnSync(process.execPath,[runner,'validate-plan',planPath,'501'],{encoding:'utf8'}).status,0);
  }
  const supported = spawnSync(process.execPath, [runner, 'version-at-least', '13.6.1', '13.3'], {
    encoding: 'utf8',
  });
  assert.equal(supported.status, 0, supported.stderr);
  const unsupported = spawnSync(process.execPath, [runner, 'version-at-least', '12.6.9', '13.3'], {
    encoding: 'utf8',
  });
  assert.notEqual(unsupported.status, 0);
	const installed = spawnSync(process.execPath, [
		runner,
		'result',
		'installed',
		'1.2.3',
		'/Applications/JishuDB.app',
		'/Users/test/Library/Application Support/JishuDB',
		'http://127.0.0.1:8090/mcp',
	], { encoding: 'utf8' });
	assert.equal(installed.status, 0, installed.stderr);
	assert.equal(JSON.parse(installed.stdout).mcpUrl, 'http://127.0.0.1:8090/mcp');
	const reservedLAN = spawnSync(process.execPath, [
		runner,
		'result',
		'installed',
		'1.2.3',
		'/Applications/JishuDB.app',
		'/Users/test/Library/Application Support/JishuDB',
		'http://127.0.0.1:8089/mcp',
	], { encoding: 'utf8' });
	assert.notEqual(reservedLAN.status, 0);
});
