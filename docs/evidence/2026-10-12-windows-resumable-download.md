# Windows resumable download validation (2026-10-12)

## Observed failure

Emma's WorkBuddy task started the Windows installer helper at 15:02:40 and
terminated it at 15:12:40 (600155 ms, SIGTERM, sandboxDenied=false). Only
107770738 of 208664148 bytes existed. A retry encountered EEXIST on the candidate
sidecar. The previously shipped macOS range downloader was present in the same
package, but the Windows helper still downloaded the entire installer in execute.

## Change

Windows now uses plan, separate bounded download calls, then execute. Each
transfer requests at most 16 MiB with a 20-second deadline. Only an exact HTTP
206 range with the approved total and identity encoding can contribute bytes.
A validated timeout prefix is retained; network errors and invalid responses
are discarded. The complete approved size and SHA-256 remain mandatory.

Private release and short-lived URL caches reduce API calls. Rate limits return
explicit waiting. Download and execute share an exclusive lock, reject hard
links/reparse paths, preserve diagnostics, and cannot install partial bytes.
A host-killed lock requires process inspection before manual recovery. The
existing 30-minute Windows plan lifetime is unchanged and rechecked before NSIS.
All 11 task setup bundles include the canonical helper; setup is version 0.1.16,
and the affected task packages are version 0.1.8.

## Verification

- Full repository suite: 60 Node tests passed, one canvas test skipped because
  canvas is unavailable; four Python tests passed, five macOS tests skipped.
- Native Windows Node v22.23.2: 17 range/orchestration tests passed and the real
  helper check returned compatible. These orchestration tests replace OS
  identity/ACL and plan-loading boundaries; the live checks below use real ones.
- Three independent live Windows download calls against stable v0.9.9 returned
  download_pending at 5143913, 10513385, and 16547531 of 208667280 bytes. The
  third call used the final helper. Each continued the same approved plan/cache;
  real Windows SID, ACL, GitHub redirect, 206 response and timeout handling ran.
- The live download check did not complete the 208 MB asset or run an installer.
  Final full-file hashing and installation rejection were exercised with test
  fixtures. It is not a WorkBuddy end-to-end installation acceptance claim.
- Emma's later SSH probes timed out before the banner, so this iteration's
  native checks ran on the operator's Windows machine in a separate temporary
  transaction, without changing its installed Desktop or MCP configuration.
- The generic skill-creator validator rejects this repository's supported
  compatibility frontmatter key. Repository packaging and bundle checks passed;
  that key was retained.

The skill-creator workflow guided the self-contained instruction/package update.
The owasp-security checklist guided redirect, range, cache, lock, integrity and
error-cause checks. Human review remains pending. Marketplace publication must
be verified independently of this source evidence.
