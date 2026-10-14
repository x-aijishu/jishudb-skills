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

Normal installation must not use the mutable `latest` endpoint, lexical version
ordering, `target_commitish` as a source revision, a prerelease, or a differently
named artifact. The explicit macOS candidate route below is a separate opt-in.

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
- publisher identity, Developer ID TeamIdentifier when applicable, and
  Gatekeeper or SmartScreen expectation.

The helper prints the plan path, SHA-256, and a redacted approval envelope.
Plan mode selects a currently free port from the bounded Desktop set. Execution
rechecks that exact port before product mutation, exclusively creates the
current-user-only schema-1 `desktop-endpoint.json`, and launches Desktop only
after the endpoint selection is durable. Execution accepts only that exact path
and digest. Unknown fields, invalid types, expired plans, non-local or redirected
paths, DACL drift, changed release identity, or changed destination/client/endpoint
fail before product mutation.

Invoke the helpers with argument arrays equivalent to the following SkillHub-compatible
package commands:

```text
zsh scripts/install-macos.sh plan \
  --client <client-name> \
  --config-target <absolute-client-config-path> \
  --connection-name jishudb

zsh scripts/install-macos.sh execute \
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

## Agent background launch and runtime negotiation

The legacy `jishudb-agent-install-plan-v1` contract remains foreground-only.
A verified immutable candidate may optionally declare `agentBackgroundLaunch`
with the integer value `1`. This declares presentation/installer support only;
it does not enable owner creation or prove that OS verification is available.
Unknown marker values are rejected.

For this candidate, helpers produce `jishudb-agent-install-plan-v2` with the
additional exact field `launchMode: "agent-background"`. Both validators require
that pairing; v1 forbids the added field. The redacted approval envelope reports
the launch mode, and the existing SHA-256 binds it along with all destinations,
release assets and client settings. Execute revalidates the candidate marker
against the reviewed plan. Drift requires a new plan and approval.

The macOS executor uses `/usr/bin/open -g <approved-app> --args
--jishudb-agent-background`. The Windows executor passes the single argument
`--jishudb-agent-background` directly to the installed executable after the
silent plan-bound installer succeeds. It does not pass `--force-run` to NSIS;
the helper remains the single initial launch owner. Existing v1 executors keep
their ordinary launch. The Windows installer path helper validates both schemas.

After launch, verify health identity, then read local public
`/api/service/capabilities` and the `agentOnboarding` schema-1 object without
redirects or credentials. Route `initial-consent` or `owner-consent` only when
`supported` is true. `password-login` retains normal login; `password-setup`,
`unavailable`, missing or unknown capability means ordinary setup may be needed.
The new-account rollout flag is independent of support for existing unset
owners. Discovery does not substitute for owner verification, legal acceptance,
OAuth PKCE or explicit write consent. Never infer success from process launch.

Candidate workflows expose an explicit `agent_background_launch` opt-in that
defaults to false. Private onboarding builds also declare this presentation
support when `agent_onboarding` is selected. Windows public preparation preserves
the source candidate's marker; it cannot add support to older binaries.
New-owner creation uses a separate bundled policy and must still be discovered
at runtime. Package release, helper/Skill promotion and device acceptance have
their own recorded status; source support does not imply published availability.

### Signed macOS and Windows updater-release compatibility

For macOS, prefer `jishudb-desktop-X.Y.Z-darwin-arm64.dmg` when that release
contains signed assets, together with its exact adjacent `.sha256` and
`.candidate.json`. A partial signed asset set does not fall back to the unsigned
asset set in the same release. Schema-3 metadata requires Developer ID, matching
authorization/distribution TeamIdentifiers and complete notarization evidence.
The plan includes `publisher.identity=developer-id`, `gatekeeper=accepted` and
the exact TeamIdentifier, all bound by its digest. Legacy schema-2 unsigned
DMGs retain their existing explicit unsigned contract.

Before mounting a signed DMG, the helper verifies its signature, Developer ID
authority, TeamIdentifier and Gatekeeper assessment. It verifies the app at
the mounted, staged and installed paths as well. Failure stops installation or
launch; it never strips quarantine, disables Gatekeeper or changes the declared
publisher to obtain success. These checks use system `codesign` and `spctl`.

The current Windows public updater workflow uses Ed25519-signed manifests with
an explicitly unsigned NSIS executable. Public preparation emits the existing
schema-1 `<installer>.candidate.json` and exact `<installer>.sha256`, after
checking final installer bytes against the update candidate. Background support
is copied from that candidate. The installer helper continues to verify the
immutable GitHub API asset digests, checksum, source binding and explicit
unsigned-executable policy. It does not claim to verify an Authenticode
signature or consume the mutable updater feed. Authenticode-only rehearsal
artifacts are not converted into this unsigned contract.

Older immutable updater releases missing the required installer sidecars are
not retroactively changed. Do not substitute `latest.yml`, an update-candidate
file, or a locally invented manifest for a missing installer contract.

## Runtime preparation after installation

Installation success and MCP connection success do not establish retrieval
readiness. Supported fresh Agent onboarding discloses the built-in embedding
model, transfer/disk requirements and trusted Hugging Face/domestic mirror
sources on the browser consent page. The user authorizes bounded preparation
with the same consent submission; it is not authority contained in the installer
plan or launch flag. The owned service starts the job after committed consent,
without delaying OAuth code exchange. Preparation authority lasts seven days;
it does not grant administrator APIs or arbitrary model/provider changes.

The Skill observes `kb_get_readiness` and uses `kb_prepare_runtime` only when the
actual runtime advertises eligibility. Both tools belong to the existing MCP
server. Reuse valid models and bundled basic OCR. Ordinary manual installation
retains its current setup UI. A missing capability, external provider, expired
preparation authority or failed runtime probe must remain an explicit recovery
state, never an instruction to copy credentials or access Desktop data directly.

## Fresh Windows initial consent

Only a runtime advertising both `authorizationMethod=windows-fresh-install` and
`deviceVerification=not-required-for-fresh-install` on `initial-consent` uses the
compiled fresh-local-install authority instead of an OS identity prompt. The
user still accepts terms and permissions in the OAuth page; browser binding,
PKCE, private signed Desktop handoff and atomic one-time initialization remain
mandatory. This is not native physical-presence verification and cannot be
selected by a client parameter. Existing owners and later sensitive operations
retain verification. Ordinary direct installation retains normal password setup.

## Explicit macOS candidate rehearsal

For a user-authorized macOS test only, add both `--candidate-tag` and
`--candidate-revision` to the normal `plan` command. The tag must be exactly
`vX.Y.Z` (the protected publication workflow's prerelease tag) or
`vX.Y.Z-desktop-candidate.N` (positive N); the revision must be the approved full
40-character lowercase source SHA. Do not infer either value, select a newer
candidate, or use this mode because stable setup failed.

The helper fetches only that exact tag from the fixed official release repository.
It requires `draft=false`, `prerelease=true`, `immutable=true`, a signed/notarized
macOS artifact, the requested source revision, and background launch support.
There is no unsigned, stable or alternate-host fallback. The resulting plan uses
`jishudb-agent-install-plan-v3`, `releaseChannel=candidate`, and
`launchMode=agent-background`. The exact tag, source, artifact digests and signer
are part of the approved plan and its SHA-256; the approval envelope displays
the channel, tag and source explicitly.

Execute takes only the unchanged plan path and SHA-256. It rejects candidate
selection flags, rechecks the prerelease state and exact assets before and after
download, and retains all ordinary hash, signer, notarization, quarantine,
per-user path, endpoint and user-consent checks. Changing prerelease/stable state,
revision, tag, assets or launch policy invalidates the plan. Ordinary v1/v2
plans remain stable-only. This rehearsal mode does not change Windows plans.
