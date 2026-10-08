---
name: jishudb
description: >-
  安装或连接 JishuDB，适用于首次设置、找不到服务、配置 Agent MCP、
  连接失败、OAuth 或 Token 授权，以及选择本机或远程连接方式。
  不用于知识库问答或完整 MCP 验收。 /
  Install, locate, connect, or troubleshoot JishuDB for an agent, including
  Desktop setup, service discovery, MCP transport, connection failures, and
  OAuth or Token authorization. Reuse a working service and verify the actual
  client connection; not for knowledge search or full MCP acceptance.
compatibility: >-
  Automatic Desktop installation requires local shell and network access in a
  supported macOS arm64 or Windows x64 user session. Windows also requires
  Node.js 22 or later. A remote or sandboxed agent cannot install software on
  the user's local machine.
metadata:
  author: jishudb
  version: "0.1.10"
  openclaw:
    homepage: https://github.com/x-aijishu/jishudb-skills/tree/main/skills/jishudb
---

# JishuDB setup

Install or connect the smallest safe JishuDB path for the user's actual
machine and client. Keep Desktop as the sole owner of Desktop data.

## At a glance

| Item | Details |
| --- | --- |
| Use when | JishuDB needs installation, endpoint discovery, connection setup, or repair. |
| Delivers | A verified connection through the actual agent client, or a precise blocked/user-action state. |
| Requires | An approved endpoint for an existing service; a local macOS arm64 or Windows x64 session for automatic Desktop installation. |
| Does not | Take ownership of Desktop data, answer document questions, or run full MCP acceptance. |

## Use this skill when

- The user wants to install JishuDB or connect an agent for the first time.
- An existing Desktop or remote service cannot be located or reached.
- The user needs to choose HTTP versus stdio or configure MCP authorization.
- A client fails to connect, or another workflow needs JishuDB setup repaired.

## Do not use this skill when

Do not use this skill for ordinary document questions; use `jishudb-search`.
For an explicitly requested smoke test or all-tools acceptance report on a
configured connector, use `jishudb-mcp-check`. Connection repair alone does not
authorize an acceptance run.

## Agent workflow

### Choose the route

1. Establish whether this Agent runs on the target machine. A cloud, container,
   or remote Agent cannot install the user's local Desktop application.
2. If the user supplied a remote JishuDB URL, use that target and do not install
   locally.
3. Resolve the Desktop endpoint from the current-user-only `desktop-endpoint.json`
   file under the Desktop state root. On macOS this is normally
   `~/Library/Application Support/JishuDB/desktop-endpoint.json`; on Windows it
   is normally `%LOCALAPPDATA%\JishuDB\desktop-endpoint.json`. Require schema 1,
   one integer `localPort`, and a loopback HTTP endpoint. If the file is absent
   for an existing pre-migration installation, try only the legacy `8088`
   endpoint; do not scan arbitrary ports.
4. Probe the resolved sibling `/health` without credentials and accept it only
   when `product`, `healthSchema`, and `status` identify JishuDB. Do not follow
   redirects.
5. Inspect bounded installed locations and a local `jishudb` binary with
   `--version` and `mcp ... --help`. Do not trust a filename alone.
6. Prefer direct Streamable HTTP for Desktop, an existing HTTP service, or a
   remote service. Use `jishudb mcp serve` only for an explicit standalone or
   headless data owner with an exact approved non-Desktop `JISHUDB_DATA`.
7. Report a stdio-only Desktop or remote client as `BLOCKED`. Do not stop
   Desktop, open its SQLite data, or install a proxy.

### Automatic Desktop installation

Read [references/installation-contract.md](references/installation-contract.md)
before installing or troubleshooting an installer transaction.

Use only the packaged helper for the current platform:

- macOS arm64: `scripts/install-macos.zsh`
- Windows x64: `scripts/install-windows.js`

On Windows, run the Node helper's `check` mode as described in the installation
contract. Continue only when it returns `status=compatible`. The Windows helper
must not materialize or invoke PowerShell; it uses the packaged JavaScript and
the fixed Windows `whoami.exe` and `icacls.exe` system tools.

Then run the helper in `plan` mode. The plan is read-only for product,
installation, client, and release state and may create only private ephemeral
evidence. It must resolve the exact release, asset digests, source revision,
application/data destinations, client, configuration target, connection name,
MCP URL, and default read-only profile.

Explain that supported fresh Agent onboarding also prepares the default local
embedding model after browser consent. The consent page specifies the model,
transfer/disk requirements and trusted sources; eligible network failures fall
back to the domestic mirror without another Desktop click. This preparation
authority is separate from ordinary read/write permissions and does not authorize
model configuration changes. Older runtimes may not support this step.

Show the helper's complete redacted approval envelope and ask once for the
exact default transaction: verified download, per-user installation,
Desktop launch, and the named non-secret client entry. After approval, pass the
unchanged plan path and SHA-256 to `execute`. Do not recreate release logic with
ad hoc commands, select a newer release, retry a failed installer, or reuse the
approval after drift.

For a same-machine client, state in the approval envelope that post-launch
browser OAuth is the default when both endpoints verify support, while manual
Token remains an explicit alternative. This describes the post-install
authorization route and does not add or alter a helper plan field.

OS publisher/Gatekeeper UI, any required first-administrator creation, client trust, and
either browser OAuth consent or protected manual Token entry remain
user-presence gates. Wait and resume after them without requesting another
Agent mutation approval. An upgrade, different destination, different
endpoint/client, write-capable profile, retry, or repair requires a new
approval.

If no eligible immutable stable release exists, return `BLOCKED` with the
release-owner action. Never offer a mutable or manual download fallback.

### Agent onboarding capability

After health identity and endpoint validation, a same-machine client may read
`/api/service/capabilities` without credentials or redirects. Inspect
`agentOnboarding.schemaVersion=1`; do not infer this capability from a version
number, background process, or successful installation alone.

- `supported=true, route=initial-consent`: start the client's native OAuth flow.
  The browser combines the agreement and requested permissions. When discovery
  also reports `authorizationMethod=windows-fresh-install` and
  `deviceVerification=not-required-for-fresh-install`, no Hello or Windows password
  prompt is required for this initial empty local installation. The signed Desktop
  handoff still runs; never infer this exception from the platform or a launch flag.
  Other initial routes retain their advertised owner-verification requirement.
  Do not ask the user to open the main window or create a JishuDB password first.
- `supported=true, route=owner-consent`: the local owner already exists without
  a password. Use native OAuth consent; never reinstall or initialize another owner.
  Password enrollment is optional for management access in the local app.
- `route=password-login`: retain ordinary browser login and OAuth consent.
- `route=password-setup`, `route=unavailable`, a missing field, or an unknown
  schema: explain that the current installation may require ordinary app setup.
  Do not promise passwordless onboarding, silently upgrade, or disable verification.

The capability is discovery only, not owner proof. The fresh-Windows exception
never applies to existing owners, later grants, enrollment, management or recovery.
On routes requiring OS verification, that verification can still be
unavailable or cancelled. Keep these outcomes distinct and use the displayed
recovery guidance; never bypass them or silently switch to Token authentication.
For an existing password-unset owner, `connectionsPath` and `legalPath` identify
local browser pages for revocation and agreement updates. Resolve only the
expected same-origin paths under the verified base path. Agents cannot accept
agreements, click authorization, or complete device-owner prompts for the user.

A release candidate with `agentBackgroundLaunch=1` supports the v2 install plan's
`launchMode=agent-background`. The helper includes this mode in the approval
summary and plan digest. Candidates without it retain the v1 foreground route.
Background presentation does not establish passwordless capability or ownership;
always discover the effective runtime route after launch. Do not reinterpret a
previously approved v1 plan or inject extra launch flags into helper commands.

The helper supports signed/notarized macOS candidates as well as the legacy
unsigned format. Review the publisher identity and, for Developer ID, the Team
ID in its approval envelope. Windows Ed25519 updater releases need the adjacent
installer `.candidate.json` and `.sha256` assets; their executable is still
unsigned. An update-candidate JSON alone is not an installer contract. See the
installation reference for the exact formats and OS checks.

### Authorization and client configuration

- Default to a `default` read-only scoped connection.
- Request `jishudb` only when the user needs write or maintenance tools and has
  separately approved that privilege.
- Determine whether the client is on the JishuDB Desktop machine before choosing
  authorization. Do not infer topology from a URL label or a reachable LAN
  address.
- For a same-machine client, first probe the resolved `/mcp` without credentials
  and without redirects. Treat OAuth as advertised only when the `401` Bearer
  challenge includes valid `resource_metadata`, the protected-resource and
  authorization-server metadata validate for the exact endpoint, and the client
  supports a native browser OAuth flow.
- When both endpoints support OAuth, present OAuth as the recommended default
  and Token as the explicit alternative before any authorization mutation. If
  the user does not select Token, configure only the non-secret MCP URL and use
  the client's browser OAuth flow. Do not direct the user to create `jkm_` first.
- Use a manual `jkm_` Token only when the user explicitly selects Token or the
  client is proven not to support OAuth. Then direct the signed-in administrator
  to Settings -> MCP connections and return `USER_ACTION_REQUIRED` for the
  client's protected Token entry. Never ask for a token in chat or write it into
  an unprotected configuration file.
- Preserve unrelated MCP entries and approvals. Prefer the client's official
  settings or command. If a file must be changed, atomically parse/merge/write
  it with a backup and only within the approved envelope.
- Do not fabricate client trust. If the client lacks a protected secret entry
  mechanism, write only the non-secret entry and return
  `USER_ACTION_REQUIRED`.
- For a client on another machine on the same Wi-Fi, use only the advertised LAN
  URL and a manual `jkm_` Token. Never send Service Bearer or OAuth credentials
  to the LAN listener, and state that LAN HTTP is not encrypted.
- OAuth cancellation, redirect/resource mismatch, PKCE failure, token exchange
  failure, or another OAuth security failure is `FAILED` or
  `USER_ACTION_REQUIRED`; it must never silently downgrade to a manual Token.
- Never read or copy OAuth access or refresh tokens.

### Prepare the authorized runtime

Keep ordinary manual installation and existing model settings unchanged. Never
run a standalone downloader against Desktop data, copy a Service Bearer, call
administrator model APIs, or download an arbitrary model URL yourself.

1. Read `kb_get_capabilities` through the actual client and inspect
   `mcp.runtimePreparation.supported` and `allowed`, plus the actual tool inventory.
   Missing capability means this runtime cannot promise automatic preparation;
   report the limitation without silently upgrading or reinstalling.
2. On a supported fresh setup, the service starts preparation after the user
   submits the combined OAuth consent. Basic local OCR and English/Simplified
   Chinese data already ship with Desktop; do not download them again. Default
   preparation downloads only the embedding model, not rerank or an answer LLM.
3. Call `kb_get_readiness` for the intended KB. Respect `pollAfterSeconds` and
   HTTP `Retry-After`; distinguish connection, runtime and task readiness.
4. For a failed operation, inspect `errorCode`, `retryable` and `recoveryAction`.
   Call `kb_prepare_runtime` only with advertised, active preparation authority
   and a retryable failure after its recovery condition is satisfied. Retry
   transient source errors with bounded backoff, at most two Agent retries per
   task; do not loop on unknown, integrity, disk or runtime-load failures.
   The service owns source selection and mirror fallback. Never silently switch
   to keyword mode or a cloud provider to claim semantic readiness.
5. If the task includes importing content, request write permission in the same
   initial OAuth flow. After runtime readiness, use existing upload/job tools,
   wait for ingestion status `completed`, then verify search/readback for the
   requested task. Read-only setup does not authorize synthetic test writes.
6. Preparation authority expires seven days after consent and is independent of
   the MCP token lifetime. Revocation or expiry requires renewed browser consent;
   no existing grant, launch flag or write profile bypasses this requirement.

### Prove the effective path

Verify through the actual host client, not a parallel curl-only path:

1. Confirm the intended server entry loaded.
2. Complete authenticated initialize/discovery and `tools/list`.
3. Call `kb_get_capabilities`, then verify target runtime readiness as above.
4. Record product, transport, protocol version, profile, tool-contract version,
   server version, and revision. Do not require a frozen tool count.

Return exactly one terminal state with its first recovery action:

- `READY`: real client calls and requested runtime capabilities are ready; any
  requested import also completed and was verified.
- `USER_ACTION_REQUIRED`: an OS, administrator, secret-entry, or client-trust
  action is waiting.
- `BLOCKED`: a required immutable release or supported transport is absent.
- `FAILED`: an available prerequisite or protocol path behaved incorrectly.

Keep credential absence, generic upstream `401`, origin/policy `403`, proven
profile insufficiency, unavailable service, wrong endpoint, protocol mismatch,
invalid response, and rate limiting distinct. Do not guess whether a rejected
credential is expired, revoked, malformed, or has the wrong secret.

## Resources

- [`scripts/install-macos.zsh`](scripts/install-macos.zsh): Use the packaged macOS arm64 helper only through the installation contract and approved plan.
- [`scripts/install-windows.js`](scripts/install-windows.js): Use the packaged Windows x64 helper only through the installation contract, compatibility check, and approved plan.

## Discovery

### Keywords

- Chinese: JishuDB下载、安装知识库、连接Agent、MCP连不上、OAuth授权.
- English: JishuDB Desktop install, service discovery, MCP setup, browser OAuth, Token authorization.

### Example requests

- “帮我下载并安装JishuDB，然后连接当前Agent。”
- “JishuDB已经装了，但Agent连不上MCP，帮我排查。”
- “Connect this agent to my existing remote JishuDB service.”
- “Set up JishuDB Desktop and verify the client's authorized connection.”

### Nearby but different

- Search existing documents → `jishudb-search`.
- Explicit connector smoke testing or all-tools acceptance → `jishudb-mcp-check`.
