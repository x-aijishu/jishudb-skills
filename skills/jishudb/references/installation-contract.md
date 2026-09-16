# JishuDB automatic installation contract

Read this reference only for Desktop installation or installer-transaction
troubleshooting. The live helper output is authoritative for one transaction.

## Fixed trust inputs

- Release repository: `x-aijishu/jishudb-desktop-releases`
- Source repository: `x-aijishu/jishudb`
- GitHub REST API version: `2026-03-10`
- Release API origin: `https://api.github.com`
- Current release-asset redirect host: `release-assets.githubusercontent.com`
- Desktop bundle ID: `com.aijishu.jishudb`
- Desktop MCP endpoint: loopback HTTP with preferred port `8088`; fresh-install
  fallback is bounded to `8090` through `8104`, with `8089` reserved for LAN MCP
- Default profile: `default`

Changing any fixed trust input requires a reviewed Skill version. Never accept
a runtime override for a different repository, API origin, asset host, bundle
ID, or endpoint-selection boundary.

## Eligible release

Enumerate published releases with the versioned API and a bounded maximum of
five 100-item pages. Fail if the bound prevents complete selection. Select the
greatest numeric SemVer `vX.Y.Z` release satisfying all of these conditions:

- `draft=false`, `prerelease=false`, and `immutable=true`;
- exactly one installer, adjacent `.sha256`, and adjacent `.candidate.json`
  asset for the current supported platform;
- every asset is uploaded and has a positive size and API
  `digest=sha256:<64 lowercase hex>`;
- candidate product, version, platform, bundle ID, source repository, source
  revision, artifact filename, artifact digest, distribution mode, and
  authorization mode match the release and platform contract;
- the candidate binds the fixed source repository and a full lowercase source
  revision inside the digest-protected immutable release asset.

The source repository may be private. Automatic installation never requests a
GitHub source-repository credential or treats private commit-API availability
as an installation prerequisite. Provenance for this path is the immutable
release, its API asset digests, adjacent checksum, and candidate manifest.

Do not use the mutable `latest` endpoint, lexical version ordering,
`target_commitish` as a source revision, a prerelease, or a differently named
artifact.

## Asset transport

Metadata and source-commit requests accept only a direct HTTPS `200` and never
follow redirects. An exact API asset request accepts either a direct `200`, or
one `302` to HTTPS `release-assets.githubusercontent.com`. Validate the redirect
before the second request, send no credentials or unrelated headers to it, and
reject user information, fragments, another redirect, or another host.

Hash every downloaded byte stream against its API digest. The adjacent checksum
must contain exactly the installer SHA-256 and filename. The candidate artifact
digest must match both. Re-fetch the release by immutable release ID before the
installer download and again after it; tag, target commitish, immutable state,
asset IDs, names, sizes, states, and digests must remain unchanged.

## Transaction plan

The Windows helper exclusively creates schema `jishudb-agent-install-plan-v1`
as a regular file, successfully assigns the current SID as owner, and verifies
one explicit current-user FullControl DACL. It contains no credential and uses
exact fields for:

- creation/expiry time and operation `fresh-install`;
- platform and current user binding;
- release repository, ID, tag, version, target commitish, and source revision;
- installer/checksum/candidate asset IDs, names, sizes, API URLs, and digests;
- application/data destinations and ownership acknowledgement;
- client name, configuration target, connection name, the exact selected MCP
  URL, and profile;
- unsigned publisher/Gatekeeper or SmartScreen expectation.

The helper prints the plan path, SHA-256, and a redacted approval envelope.
Plan mode selects a currently free port from the bounded Desktop set. Execution
rechecks that exact port before product mutation, exclusively creates the
current-user-only schema-1 `desktop-endpoint.json`, and launches Desktop only
after the endpoint selection is durable. Execution accepts only that exact path
and digest. Unknown fields, invalid types, expired plans, non-local or redirected
paths, DACL drift, changed release identity, or changed destination/client/endpoint
fail before product mutation.

Invoke the helpers with argument arrays equivalent to the following standard
package commands:

```text
scripts/install-macos.zsh plan \
  --client <client-name> \
  --config-target <absolute-client-config-path> \
  --connection-name jishudb

scripts/install-macos.zsh execute \
  --plan <absolute-plan-path> \
  --plan-sha256 <approved-lowercase-sha256>

node scripts/install-windows.js check

node scripts/install-windows.js plan \
  -Client <client-name> \
  -ConfigTarget <absolute-client-config-path> \
  -ConnectionName jishudb

node scripts/install-windows.js execute \
  -PlanPath <absolute-plan-path> \
  -PlanSha256 <approved-lowercase-sha256>
```

The Windows helper requires Node.js 22 or later and runs entirely as packaged
JavaScript. It resolves only local, non-redirected absolute system paths for
`whoami.exe` and `icacls.exe`, using them for SID lookup, creation-time owner
assignment, and current-user-only DACL operations. It must not materialize,
invoke, or change policy for PowerShell. Do not use shell interpolation, a token
argument, or an unreviewed helper copy. Parse the helper's single JSON result. A non-zero
exit plus `status=failed` is terminal for that plan; do not regenerate or retry
under the old approval.

## Platform completion

### macOS arm64

Install a fresh verified bundle to `~/Applications/JishuDB.app` without
elevation. Mount the DMG read-only and without Finder, require exactly one
regular JishuDB bundle, validate its identity/version/runtime/release manifest,
and reject every absolute, dangling, or bundle-escaping symlink. Preserve only
relative symlinks that resolve inside the verified bundle, revalidate them after
staging and installation without removing quarantine, and atomically rename the
staged bundle into a previously absent destination. Detach on every exit.
Revalidate the installed receipt, then launch once through Launch Services.
Persist the reviewed endpoint at
`~/Library/Application Support/JishuDB/desktop-endpoint.json` before launch.

### Windows x64

Use the per-user NSIS Agent-plan path only. The installer-path helper validates
the plan schema/digest, current SID, expiry, release, canonical non-reparse
application/data paths, absence of foreign content, and explicit data ownership
acknowledgement before NSIS prepares any path. Generic silent mode is not the
Skill path. Preserve the ordinary interactive installer pages. Revalidate the
Start Menu receipt, runtime, version, and data bootstrap, then launch once.
Write the reviewed endpoint beside `data-location.json` as
`desktop-endpoint.json` before launch. The Skill helper uses Node.js HTTPS,
streaming SHA-256 validation, argument-array process launch, and Windows-native
SID/ACL tools; PowerShell and its execution policy are not prerequisites.

## Stop conditions

Stop without retry or fallback when any trust input, plan field, digest,
candidate field, redirect, source-revision binding, release re-fetch, installation
receipt, or endpoint identity is invalid or ambiguous. Never overwrite an
existing app, upgrade, select a different data directory, delete partial product
state, weaken OS security, or offer a manual unverified download under the old
approval.
