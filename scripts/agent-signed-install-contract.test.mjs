import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../skills/jishudb/scripts/install-macos.zsh', import.meta.url), 'utf8');
const match = source.match(/<<'JXA'\r?\n([\s\S]*?)\r?\nJXA\r?\n/);
assert.ok(match, 'macOS installer must contain its actual JXA planner');
const embedded = match[1];
const documents = {};
const helper = runInNewContext(`${embedded}\n({validateCandidate,createPlan,validatePlan,selectRelease,run});`, {
  ObjC: { import() {}, unwrap: value => value },
  $: { NSData: { dataWithContentsOfFile: key => JSON.stringify(documents[key]) },
    NSString: { alloc: { initWithDataEncoding: value => value } }, NSUTF8StringEncoding: 0 },
});
const sha = 'a'.repeat(64);
const revision = 'b'.repeat(40);
function candidate() {
  return {
    schemaVersion: 3, product: 'jishudb-desktop', productName: 'JishuDB', bundleIdentifier: 'com.aijishu.jishudb',
    version: '1.2.3', revision, target: 'darwin-arm64', minimumSystemVersion: '13.3', agentBackgroundLaunch: 1,
    artifact: { name: 'jishudb-desktop-1.2.3-darwin-arm64.dmg', sha256: sha, size: 123 },
    runtimeLock: { path: 'packaging/macos/desktop-runtime-lock.json', sha256: sha },
    source: { repository: 'x-aijishu/jishudb', runId: '123', runAttempt: 1 },
    distribution: { mode: 'developer-id-notarized-dmg-v1', publisherIdentity: 'developer-id', teamIdentifier: 'AB12CD34EF',
      hardenedRuntime: true, secureTimestamp: true,
      appNotarization: { status: 'Accepted', stapled: true, submissionId: 'app' },
      dmgNotarization: { status: 'Accepted', stapled: true, submissionId: 'dmg' } },
    authorization: { mode: 'signed-developer-id-v1', publisherIdentity: 'developer-id', teamIdentifier: 'AB12CD34EF',
      localUserPresence: { firstAdmin: true, migration: true, recovery: true } },
    signing: { certificateExpiresAt: '2027-01-01T00:00:00Z', certificateFingerprintSha256: sha, nativeFileCount: 1 },
    artwork: Object.fromEntries(Object.entries({ source: 'logo-jishudb.svg', png: 'jishudb-icon.png', icns: 'jishudb.icns' })
      .map(([key, name]) => [key, { path: `desktop/assets/${name}`, sha256: sha }])),
  };
}
function release() {
  const asset = (name, id) => ({ id, name, size: 123, state: 'uploaded', digest: `sha256:${sha}`,
    url: `https://api.github.com/repos/x-aijishu/jishudb-desktop-releases/releases/assets/${id}` });
  return { id: 1, tag_name: 'v1.2.3', target_commitish: 'main', draft: false, prerelease: false, immutable: true,
    assets: ['', '-unsigned'].flatMap((kind, index) => {
      const name = `jishudb-desktop-1.2.3${kind}-darwin-arm64.dmg`;
      return [asset(name, 1 + index * 3), asset(`${name}.sha256`, 2 + index * 3), asset(`${name}.candidate.json`, 3 + index * 3)];
    }) };
}

test('macOS selects signed assets, binds signer into the plan and rejects signer or launch drift', () => {
  documents.releases = [release()];
  const selected = helper.selectRelease(['releases']);
  assert.equal(selected.installer.name, candidate().artifact.name);
  const value = helper.validateCandidate(candidate(), selected);
  const plan = helper.createPlan(selected, value, ['501', '/Users/test/Applications/JishuDB.app', '/Users/test/Library/Application Support/JishuDB', 'Test', '/Users/test/client.json', 'jishudb', 'http://127.0.0.1:8088/mcp']);
  assert.equal(plan.publisher.teamIdentifier, 'AB12CD34EF');
  assert.equal(plan.publisher.identity, 'developer-id');
  assert.equal(plan.schema, 'jishudb-agent-install-plan-v2');
  helper.validatePlan(plan);
  documents.plan = JSON.parse(JSON.stringify(plan)); documents.candidate = candidate();
  assert.equal(helper.run(['candidate-plan', 'candidate', 'plan']), 'ok');
  documents.plan.publisher.teamIdentifier = 'ZZ99YY88XX';
  assert.throws(() => helper.run(['candidate-plan', 'candidate', 'plan']), /publisher/);
  documents.plan = JSON.parse(JSON.stringify(plan)); delete documents.candidate.agentBackgroundLaunch;
  assert.throws(() => helper.run(['candidate-plan', 'candidate', 'plan']), /launch capability/);
  const broken = release(); broken.assets = broken.assets.filter(asset => asset.name !== `${candidate().artifact.name}.candidate.json`);
  documents.releases = [broken];
  assert.throws(() => helper.selectRelease(['releases']), /no eligible/);
});

test('macOS candidate rejects incomplete or mixed signing evidence before installation', () => {
  documents.releases = [release()]; const selected = helper.selectRelease(['releases']);
  for (const mutate of [
    value => { value.distribution.publisherIdentity = 'none'; },
    value => { value.authorization.teamIdentifier = 'ZZ99YY88XX'; },
    value => { value.distribution.appNotarization.stapled = false; },
    value => { value.distribution.dmgNotarization.status = 'Rejected'; },
    value => { value.artifact.size++; },
    value => { value.agentBackgroundLaunch = true; },
    value => { value.artwork.icns.sha256 = ''; },
    value => { value.extra = true; },
  ]) {
    const value = candidate(); mutate(value); assert.throws(() => helper.validateCandidate(value, selected));
  }
});

test('explicit macOS candidate selection binds source, approval channel and execution revalidation', () => {
  const prerelease = { ...release(), tag_name: 'v1.2.3-desktop-candidate.1', prerelease: true };
  documents.prerelease = prerelease;
  documents.releases = [prerelease, release()];
  assert.equal(helper.selectRelease(['releases']).release.tag, 'v1.2.3');
  const selected = JSON.parse(helper.run(['select-candidate', 'prerelease', prerelease.tag_name, revision]));
  const value = helper.validateCandidate(candidate(), selected);
  const plan = helper.createPlan(selected, value, ['501', '/Users/test/Applications/JishuDB.app', '/Users/test/Library/Application Support/JishuDB', 'WorkBuddy', '/Users/test/client.json', 'jishudb', 'http://127.0.0.1:8088/mcp']);
  assert.equal(plan.schema, 'jishudb-agent-install-plan-v3');
  assert.equal(plan.releaseChannel, 'candidate');
  assert.equal(plan.launchMode, 'agent-background');
  helper.validatePlan(plan);
  documents.plan = plan;
  documents.candidate = candidate();
  const envelope = JSON.parse(helper.run(['result', 'plan', 'plan', 'c'.repeat(64)]));
  assert.equal(envelope.approval.releaseChannel, 'candidate');
  assert.equal(envelope.approval.releaseTag, prerelease.tag_name);
  assert.equal(envelope.approval.sourceRevision, revision);
  assert.equal(helper.run(['candidate-plan', 'candidate', 'plan']), 'ok');
  assert.equal(helper.run(['release-match', 'prerelease', 'plan']), 'ok');
  for (const mutate of [
    r => { r.immutable = false; },
    r => { r.draft = true; },
    r => { r.prerelease = false; },
    r => { r.tag_name = 'v1.2.3-desktop-candidate.2'; },
    r => { r.assets[0].digest = `sha256:${'d'.repeat(64)}`; },
    r => { r.assets[0].id++; },
    r => { r.assets[0].size++; },
  ]) {
    documents.changed = structuredClone(prerelease); mutate(documents.changed);
    assert.throws(() => helper.run(['release-match', 'changed', 'plan']));
  }
  documents.candidate.revision = 'c'.repeat(40);
  assert.throws(() => helper.run(['candidate-plan', 'candidate', 'plan']), /revision/);
});

test('candidate opt-in rejects unbound, unsigned, foreground and downgraded requests', () => {
  documents.prerelease = { ...release(), tag_name: 'v1.2.3-desktop-candidate.1', prerelease: true };
  for (const [tag, sha] of [
    ['v01.2.3', revision], ['v1.2.3-desktop-candidate.0', revision],
    ['v1.2.3-desktop-candidate.1/../../latest', revision],
    ['v1.2.3-desktop-candidate.1', ''], ['v1.2.3-desktop-candidate.1', 'main'],
  ]) assert.throws(() => helper.run(['select-candidate', 'prerelease', tag, sha]));
  for (const mutate of [
    r => { r.prerelease = false; }, r => { r.immutable = false; }, r => { r.draft = true; },
    r => { r.assets = r.assets.filter(a => a.name.includes('unsigned')); },
  ]) {
    documents.rejected = structuredClone(documents.prerelease); mutate(documents.rejected);
    assert.throws(() => helper.run(['select-candidate', 'rejected', documents.prerelease.tag_name, revision]));
  }
  const selected = JSON.parse(helper.run(['select-candidate', 'prerelease', documents.prerelease.tag_name, revision]));
  for (const mutate of [
    c => { c.revision = 'c'.repeat(40); }, c => { delete c.agentBackgroundLaunch; },
    c => { c.schemaVersion = 2; }, c => { c.distribution.dmgNotarization.stapled = false; },
  ]) { const c = candidate(); mutate(c); assert.throws(() => helper.validateCandidate(c, selected)); }
  const plan = helper.createPlan(selected, candidate(), ['501', '/Users/test/Applications/JishuDB.app', '/Users/test/Library/Application Support/JishuDB', 'WorkBuddy', '/Users/test/client.json', 'jishudb', 'http://127.0.0.1:8088/mcp']);
  for (const mutate of [
    p => { p.schema = 'jishudb-agent-install-plan-v2'; }, p => { p.releaseChannel = 'stable'; },
    p => { delete p.releaseChannel; }, p => { p.launchMode = 'foreground'; },
    p => { p.publisher = {identity: 'none', gatekeeper: 'manual-required'}; },
    p => { p.release.version = '1.2.4'; }, p => { p.release.sourceRevision = ''; },
  ]) { const changed = structuredClone(plan); mutate(changed); assert.throws(() => helper.validatePlan(changed)); }
});


test('protected publication version tags are candidate-only while prerelease is true', () => {
  documents.versionTag = { ...release(), prerelease: true };
  documents.onlyPrerelease = [documents.versionTag];
  assert.throws(() => helper.selectRelease(['onlyPrerelease']), /no eligible/);
  const selected = JSON.parse(helper.run(['select-candidate', 'versionTag', 'v1.2.3', revision]));
  helper.validateCandidate(candidate(), selected);
  const plan = helper.createPlan(selected, candidate(), ['501', '/Users/test/Applications/JishuDB.app', '/Users/test/Library/Application Support/JishuDB', 'WorkBuddy', '/Users/test/client.json', 'jishudb', 'http://127.0.0.1:8088/mcp']);
  helper.validatePlan(plan); documents.versionPlan = plan;
  assert.equal(plan.release.tag, 'v1.2.3');
  assert.equal(plan.releaseChannel, 'candidate');
  assert.equal(helper.run(['release-match', 'versionTag', 'versionPlan']), 'ok');
  documents.versionTag.prerelease = false;
  assert.throws(() => helper.run(['select-candidate', 'versionTag', 'v1.2.3', revision]));
  assert.throws(() => helper.run(['release-match', 'versionTag', 'versionPlan']));
});
