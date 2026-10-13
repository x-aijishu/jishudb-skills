import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { createRequire } from 'node:module';
import test from 'node:test';
import { renewCatalogPayload } from './fixtures/mirror-catalog-renewal.mjs';

const require = createRequire(import.meta.url);
const catalog = require('../skills/jishudb/scripts/release-mirror-catalog.cjs');
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const publicBytes = publicKey.export({ format: 'der', type: 'spki' });
const authority = { algorithm: 'Ed25519', publicKey: publicBytes.toString('base64'),
  keyId: `ed25519-sha256:${createHash('sha256').update(publicBytes).digest('hex')}` };
const privateBytes = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
const nowMs = Date.parse('2026-10-12T12:00:00.000Z');

function initialPayload() {
  const version = '0.9.9';
  const repositoryURL = 'https://cnb.cool/x-aijishu/jishudb-desktop-releases';
  return { schemaVersion: 1, domain: catalog.DOMAIN, product: 'jishudb-desktop', channel: 'stable', sequence: 1, version,
    sourceRevision: 'a'.repeat(40), issuedAt: '2026-10-12T11:00:00.000Z', expiresAt: '2026-10-19T11:00:00.000Z',
    canonicalRelease: { repository: catalog.REPOSITORY, id: 123, tag: `v${version}`, targetCommitish: 'main', url: `https://github.com/${catalog.REPOSITORY}/releases/tag/v${version}` },
    mirror: { repositoryURL, redirectAllowlist: [{ origin: 'https://asset.cnb.cool', pathPrefix: '/assets/t/' }] },
    artifacts: catalog.artifactSpecifications(version).map((item, index) => ({ ...item, assetId: index + 1, size: 42, sha256: 'b'.repeat(64),
      canonicalURL: `https://github.com/${catalog.REPOSITORY}/releases/download/v${version}/${item.name}`,
      mirrorURL: `${repositoryURL}/-/releases/download/v${version}/${item.name}` })),
  };
}

function verify(payload, options = {}) {
  return catalog.verifyCatalog(catalog.signCatalog(payload, privateBytes, authority), { authority, nowMs, ...options });
}

test('both catalog schemas authenticate without changing native installer provenance', () => {
  const original = initialPayload();
  const renewal = renewCatalogPayload(original);
  for (const payload of [original, renewal]) {
    const verified = verify(payload);
    assert.equal(verified.payload.canonicalRelease.id, original.canonicalRelease.id);
    for (const [platform, architecture] of [['win32', 'x64'], ['darwin', 'arm64']]) {
      for (const kind of ['installer', 'candidate', 'checksum']) {
        const asset = catalog.selectArtifact(verified, { platform, architecture, kind });
        const predecessor = original.artifacts.find(entry => entry.name === asset.name);
        assert.equal(asset.assetId, predecessor.assetId);
        assert.equal(asset.canonicalURL, predecessor.canonicalURL);
        assert.equal(asset.sha256, predecessor.sha256);
        assert.equal(catalog.assertDownloadURL(asset.mirrorURL, verified).hostname, 'cnb.cool');
      }
    }
  }
  assert.equal(catalog.publicationTag(renewal), 'v0.9.9-policy.2');
  assert.equal(catalog.catalogArtifacts(renewal).length, 15);
});

test('schema 2 rejects policy/native substitution, wrong publication generation and missing audit', () => {
  const valid = renewCatalogPayload(initialPayload());
  for (const mutate of [
    payload => { payload.domain = catalog.DOMAIN; },
    payload => { payload.canonicalRelease = payload.policyRelease; },
    payload => { payload.policyRelease.id = payload.canonicalRelease.id; },
    payload => { payload.mirror.releaseTag = 'v0.9.9-policy.99'; },
    payload => { payload.previousCatalogSha256 = 'invalid'; },
    payload => { payload.evidenceArtifacts = []; },
    payload => { payload.artifacts.find(asset => asset.name.endsWith('-Setup.exe')).canonicalURL = `${payload.policyRelease.url.replace('/tag/', '/download/')}/JishuDB-Windows-x64-0.9.9-Setup.exe`; },
  ]) {
    const payload = structuredClone(valid);
    mutate(payload);
    assert.throws(() => catalog.signCatalog(payload, privateBytes, authority), error => error.code === 'catalog_invalid');
  }
});

test('schema 2 retains signature, freshness, rollback and equivocation failures', () => {
  const payload = renewCatalogPayload(initialPayload());
  const signed = catalog.signCatalog(payload, privateBytes, authority);
  signed.payload.previousCatalogSha256 = 'f'.repeat(64);
  assert.throws(() => catalog.verifyCatalog(signed, { authority, nowMs }), { code: 'catalog_signature_invalid' });
  assert.throws(() => verify(payload, { nowMs: Date.parse(payload.expiresAt) }), { code: 'catalog_expired' });
  assert.throws(() => verify(payload, { minimumSequence: payload.sequence + 1 }), { code: 'catalog_rollback' });
  assert.throws(() => verify(payload, { minimumSequence: payload.sequence, acceptedPayloadSha256: 'f'.repeat(64) }), { code: 'catalog_equivocation' });
});
