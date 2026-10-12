# Windows download proxy validation (2026-10-12)

## Scope

Use already-configured HTTP_PROXY/HTTPS_PROXY values for the Windows Skill
installer helper. Do not add VPN reminders or modify system proxy settings.
The canonical setup Skill is 0.1.17 and all 11 bundled task Skills are 0.1.9.

## Effective path

The CLI validates arguments/platform before preparing a child-only environment.
If HTTP/HTTPS proxy variables exist, the helper validates their HTTP(S) URLs,
normalizes case, preserves NO_PROXY and adds local loopback exclusions. It then
restarts the same Node helper once with --use-env-proxy, before any network call.
The child detects its prepared startup configuration and does not restart again.
Proxy credentials are carried only in the inherited child environment; no URL or
credential is added to command arguments, plans, client entries, or diagnostics.

Both fetchWithTimeout (release metadata and sidecars) and requestDownload
(installer ranges) run in that proxy-enabled process. No configured proxy keeps
the previous network behavior. A failed configured proxy has no direct fallback.
The installer/Desktop process still uses its existing sanitized environment.
System/PAC-only proxy discovery and SOCKS proxy support are outside this change.

Node's startup option is available in 22.21+ and 24.5+ release lines; the helper
checks the runtime's allowed flags rather than assuming every Node 22 supports it.
Unsupported runtimes fail explicitly only when a proxy is configured. See the
[Node CLI documentation](https://nodejs.org/api/cli.html#--use-env-proxy).

## Observed checks

- Repository Node suite: 68 passed, one canvas-dependent test skipped.
- Python suite: four passed, five macOS-specific tests skipped.
- Native Windows Node v22.23.2: all eight proxy tests passed.
- Real subprocess tests used a local HTTP CONNECT proxy and local health server.
  Metadata and asset HTTPS requests reached the configured proxy with expected
  proxy authentication, using HTTP_PROXY only, HTTPS_PROXY only, and both.
  The fixture deliberately rejected CONNECT, proving proxy failures did not
  silently fall back to direct external connections. No external service was
  contacted by these transport fixtures.
- localhost and 127.0.0.1 health requests reached the local server directly in
  each configuration. Unit checks also cover preserving user exclusions, IPv6
  loopback exclusions, missing/invalid configuration, unsupported Node, one-time
  restart, exit/error propagation and credential redaction.
- A real Windows CLI check with a configured proxy returned one compatible JSON
  result after the scoped restart. This was not an external full-installer
  download or a WorkBuddy end-to-end installation test.
- Generated setup bundles for all 11 task Skills match the canonical source;
  git diff --check passed.

skill-creator guided the self-contained instructions and regenerated packages.
owasp-security guided the credential, loopback, redirect and process boundaries.
Human review and marketplace publication of these versions remain separate.
