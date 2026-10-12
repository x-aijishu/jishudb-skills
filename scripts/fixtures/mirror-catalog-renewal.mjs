import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const catalog = require('../../skills/jishudb/scripts/release-mirror-catalog.cjs');

/** Create signed-test input with unchanged installer identity and renewed policy. */
export function renewCatalogPayload(previous) {
  const payload = structuredClone(previous);
  payload.schemaVersion = 2;
  payload.domain = catalog.RENEWAL_DOMAIN;
  payload.sequence += 1;
  payload.previousCatalogSha256 = createHash('sha256').update(catalog.canonicalBytes(previous)).digest('hex');
  const runId = 1000 + payload.sequence;
  const policyTag = `v${payload.version}-policy.${runId}.1`;
  payload.policyRelease = { repository: catalog.REPOSITORY, id: runId,
    tag: policyTag, url: `https://github.com/${catalog.REPOSITORY}/releases/tag/${policyTag}`, targetCommitish: 'policy-build' };
  payload.mirror.releaseTag = `v${payload.version}-policy.${payload.sequence}`;
  const mirrorPrefix = `${payload.mirror.repositoryURL}/-/releases/download/${payload.mirror.releaseTag}/`;
  payload.mirror.redirectAllowlist = payload.mirror.redirectAllowlist.map(rule => rule.origin === 'https://cnb.cool'
    ? { ...rule, pathPrefix: new URL(mirrorPrefix).pathname } : rule);
  payload.artifacts = payload.artifacts.map((artifact, index) => ({ ...artifact,
    ...(catalog.RENEWED_METADATA.includes(artifact.name) ? {
      assetId: runId * 100 + index,
      canonicalURL: `https://github.com/${catalog.REPOSITORY}/releases/download/${policyTag}/${artifact.name}`,
      sha256: createHash('sha256').update(`${policyTag}:${artifact.name}`).digest('hex'),
    } : {}),
    mirrorURL: `${mirrorPrefix}${artifact.name}`,
  }));
  payload.evidenceArtifacts = [
    ...(payload.evidenceArtifacts ?? []).map(artifact => ({ ...artifact,
      canonicalURL: `https://github.com/${catalog.REPOSITORY}/releases/download/${policyTag}/${artifact.name}`,
      mirrorURL: `${mirrorPrefix}${artifact.name}`,
    })),
    { name: `policy-refresh-${runId}-1.json`, size: 2, sha256: createHash('sha256').update('{}').digest('hex'),
      assetId: runId * 100 + 99,
      canonicalURL: `https://github.com/${catalog.REPOSITORY}/releases/download/${policyTag}/policy-refresh-${runId}-1.json`,
      mirrorURL: `${mirrorPrefix}policy-refresh-${runId}-1.json` },
  ].sort((a, b) => a.name.localeCompare(b.name));
  return payload;
}
