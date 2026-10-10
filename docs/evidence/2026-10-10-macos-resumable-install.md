# macOS resumable installation validation (2026-10-10)

## Scope

User-authorized Air installation testing, with WorkBuddy network and sandbox
settings unchanged. The task added its approved JishuDB MCP connection.
The separate existing 18095 service is outside the installation target. No
OAuth, agreement, device-owner verification, or OS trust prompt is automated.
Validation used local changes based on main
`65fee219c32188517e76b83eac21571c1912b6e7`. The interview entrypoint is version 0.1.7;
the bundled setup source is version 0.1.15.

## Reproduced failure and changes

The original WorkBuddy task terminated the foreground installer at its 300-
and 420-second host deadlines. Partial files were 34,910,208 and 41,431,040
bytes versus the approved 288,335,648-byte asset. Host logs showed ProcessKill
and sandboxDenied=false. This was not evidence of a completed checksum or GUI
installation denial.

The macOS helper now separates plan, bounded download, and execute. Download
accepts only the exact requested HTTP 206 range, keeps valid timeout prefixes,
and requires the full approved SHA-256 before returning downloaded. Each
transfer request is bounded to 20 seconds and 16 MiB; metadata requests add
overhead, so the total invocation is not advertised as 20 seconds.

Testing exposed excessive anonymous GitHub API requests when metadata was
refetched on every step. At 271,335,415 bytes, the API returned 403 with a
60-request exhausted quota. The implementation now atomically caches the
verified pre-download release snapshot, briefly reuses a private validated
signed URL, observes rate-limit waiting, and re-fetches release state for
installation. Cached-URL rejection has one bounded refresh; a new rejected URL
fails rather than looping. Cleanup releases the transaction lock last.

## Completed checks

- Repository Node suite: 43 passed; one canvas test skipped for missing canvas.
- Cross-platform Python suite: 4 passed.
- Five macOS shell orchestration tests passed on Air using a local fake curl:
  timeout continuation and final hash; wrong-range rejection preserving bytes;
  CDN rate-limit waiting; bounded cached-URL refresh; atomic snapshot publication.
  These tests are intentionally skipped on Linux and run on macOS separately.
- Additional real-host probes rejected missing complete downloads, symlink and
  hardlink caches, concurrent locks, and expired plans without installing DB.
- Actual Air download completed across independent invocations, slow partial
  responses, and the API reset. Final size: 288,335,648 bytes. SHA-256:
  `8fd7b6c861d4ee9037db877357a97bef0f2072959a4b0f1f2b84918f3c0f0779`.
  Release: stable v0.9.5, source `5c0111171a155f8eea9d9cec747b95640e02d5df`.
  Download-only checks left Desktop absent. No claim of installation follows
  from this successful independent download.
- WorkBuddy GUI task `0d47a03c-8d07-443e-bee1-b6e1bae95de6` began at 15:20
  local time. The actual host logged configuredSandboxEnabled=true,
  effectiveSandboxEnabled=true, ruleProfile=default-strict. After the existing
  test installation authority was conveyed, it generated its own plan and
  started separate download invocations, recognizing download_pending as normal.
  It corrected an initial relative-path invocation before the first transfer.

## WorkBuddy installation and passwordless connection

The GUI task independently accumulated 71,348,746 bytes in twelve bounded
steps. To avoid downloading the same 288 MB artifact twice during this test,
the operator copied the independently completed, SHA-256-verified identical
asset into this plan's cache, after matching both plans' release/asset identity
and acquiring the transaction lock. This is explicit cache-assisted acceptance,
not a claim that WorkBuddy downloaded every byte itself.

WorkBuddy's next download call revalidated that complete cache and returned
`downloaded` with `bytesThisStep=0`. It then invoked `execute` through its
unchanged strict sandbox, which returned `installed` (exit 0) at approximately
15:31 local time. Independent health checks confirmed Desktop 0.9.5 at 8088,
revision `5c0111171a155f8eea9d9cec747b95640e02d5df`; the separate 18095 service
remained healthy and unchanged.

The host initially skipped the new untrusted connector. The user completed
client trust and browser/device-owner consent. The browser showed authorized,
but an earlier callback failed with `InvalidGrantError`; an old completed page
was not proof of token exchange. Browser UI automation was denied by macOS
assistive-access permissions, so no consent or OS prompts were automated.
The user initiated a fresh flow and promptly returned to WorkBuddy.

At 16:12:05 local time, WorkBuddy logged callback `success=true`, primary
Streamable HTTP connection success, and discovery of 36 JishuDB tools, including
capabilities, readiness, runtime preparation, KB writes, Notes, and readback.
The DB's public auth status still reported `passwordState=unset`. Thus the
passwordless host connection passed; a management password was not required.

A separate ACP interface trial had different session sandbox parameters and
was cancelled. It is excluded from GUI host acceptance evidence.

## Completed passwordless interview task

WorkBuddy continued the authorized interview task in GUI session
`921b15c4-0b9c-4e5d-8a86-6d73ffa019f5`. Actual host MCP calls passed capabilities,
KB inventory and runtime readiness. Readiness reported embeddingState=ready,
ingestionReady=true, searchReady=true, runtimeVerified=true and hybrid retrieval
with Xenova/multilingual-e5-small.

The task created `interview-coach-tencent-ai-infra-20261010`. Its smoke Markdown
upload became indexed; document text/raw readback passed and search returned the
document. Independently comparing the actual upload bytes and host raw readback
produced the same SHA-256:
`c5b7c014450d9fd36c643f3abad1d4a1eabfe540663990804caeb7c3f5470d3c`.

The task then created and linked four public Notes (sources, prep pack, question
bank and revision). All four ingest jobs completed; actual kb_list_documents
returned those four completed documents plus the indexed smoke document, with
no next cursor. A post-ingestion search returned five hits. Personal interview
answers were not part of the authorized stored test material.

The host presented `interview-coach.pdf`, along with Markdown and HTML outputs,
and its session status was completed. Independent pdfinfo validation confirmed
16 A4 pages, 2,046,047 bytes and PDF 1.4. This validates delivery and extractable
text, not an independent factual review of every research claim or a visual
layout audit. The artifact directory on Air is:
`~/WorkBuddy/2026-10-10-15-43-39/interview-crash-coach-20261010T081433Z-7f3a/`.

Final public auth status still reported `passwordState=unset`. Installation,
user-operated authorization, actual host writes/search/readback, and delivery
therefore passed without setting a JishuDB management password. Human consent
and verified-cache reuse remain explicit parts of this assisted test; it was
not an unattended, all-bytes-downloaded-by-WorkBuddy rehearsal.

## Source validation and publication boundary

The skill-creator workflow guided the entrypoint changes and independent
scenario review. The owasp-security review covered integrity, authorization,
redirect, cache and lock boundaries. Reported lock/snapshot/URL-refresh issues
were corrected and tested. This record accompanies the implementing commit;
the earlier 65fee21 publication did not include these follow-up changes. Remote
publication is established by Git readback, independently of device validation.

Current helper SHA-256: `b89c4eb483f00b6ccfe4230a5235b6f2dbe6a3b299a820e9fe1930a5e3c63e59`.
