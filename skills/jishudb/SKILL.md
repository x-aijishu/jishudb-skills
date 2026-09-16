---
name: jishudb
description: 在本机或远程环境中安装、定位、连接或排查 JishuDB，并选择正确的 MCP 传输方式。适用于设置 JishuDB、连接 Agent、修复 MCP 连接或让当前 Agent 使用 JishuDB；不用于完整的 MCP 验收测试。
metadata:
  author: jishudb
  version: "0.1.8"
  compatibility: 自动安装桌面版需要本地 shell、网络访问以及受支持的 macOS arm64 或 Windows x64 用户会话；Windows 还需要 Node.js 22 或更高版本。远程或沙箱中的 Agent 无法安装用户本机软件。
---

# JishuDB setup

Install or connect the smallest safe JishuDB path for the user's actual
machine and client. Keep Desktop as the sole owner of Desktop data.

## Choose the route

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

## Automatic Desktop installation

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

OS publisher/Gatekeeper UI, first-administrator creation, client trust, and
either browser OAuth consent or protected manual Token entry remain
user-presence gates. Wait and resume after them without requesting another
Agent mutation approval. An upgrade, different destination, different
endpoint/client, write-capable profile, retry, or repair requires a new
approval.

If no eligible immutable stable release exists, return `BLOCKED` with the
release-owner action. Never offer a mutable or manual download fallback.

## Authorization and client configuration

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

## Prove the effective path

Verify through the actual host client, not a parallel curl-only path:

1. Confirm the intended server entry loaded.
2. Complete authenticated initialize/discovery and `tools/list`.
3. Call `kb_get_capabilities`.
4. Record product, transport, protocol version, profile, tool-contract version,
   server version, and revision. Do not require a frozen tool count.

Return exactly one terminal state with its first recovery action:

- `READY`: the real client call succeeded.
- `USER_ACTION_REQUIRED`: an OS, administrator, secret-entry, or client-trust
  action is waiting.
- `BLOCKED`: a required immutable release or supported transport is absent.
- `FAILED`: an available prerequisite or protocol path behaved incorrectly.

Keep credential absence, generic upstream `401`, origin/policy `403`, proven
profile insufficiency, unavailable service, wrong endpoint, protocol mismatch,
invalid response, and rate limiting distinct. Do not guess whether a rejected
credential is expired, revoked, malformed, or has the wrong secret.
