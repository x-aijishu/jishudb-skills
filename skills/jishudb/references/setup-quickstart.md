# Routine setup

Use this short path for ordinary local installation and connection. Resolve
helper paths from the parent setup directory. Open the full installation
contract only for warnings, an unsupported case, or a specific helper failure.

1. If the host already exposes JishuDB tools, make one real capability call.
   When it succeeds, reuse the connection and continue the user's task.
2. Honor an explicitly selected remote service. Do not replace it with a local
   installation; use the connection recovery guide for that target.
3. For a local target, read the effective client entry once, make one direct
   loopback health probe without proxying or credentials, and check the exact
   application executable. A directory, endpoint preference, retained database
   or Python cache is not an installed app. If the executable is absent, go
   straight to step 4; do not recursively list caches, open databases, repeatedly
   probe the empty port, or ask whether to generate a plan. If it exists, use
   the full setup guide's startup/connection route instead of reinstalling.
4. On Windows, run `node scripts/install-windows.js check` once, then
   `node scripts/install-windows.js plan -Client WorkBuddy -ConfigTarget <actual-config-path> -ConnectionName jishudb`.
   On macOS, run `zsh scripts/install-macos.zsh plan --client workbuddy --config-target <actual-config-path> --connection-name jishudb`.
   Use the actual host name/config path when the client is not WorkBuddy. CNB
   is the default. Let the helper validate retained data and supported paths.
5. On `plan_ready`, match the transaction to existing explicit user setup
   authorization. When covered, state a short progress update and continue.
   Otherwise ask one brief confirmation for the concrete installation. Never
   fabricate authorization from the ready status. Keep hashes, plan JSON and
   technical tables in tool evidence unless requested or needed for a problem.
6. Pass the exact returned plan path and digest to `download`, retaining the
   approved source. Call bounded steps until `downloaded`; report progress
   briefly without ending the workflow. Honor `download_waiting` intervals.
   Then call `execute` once. Do not run an unbounded shell retry loop.
7. Pause only for actual installer/security, legal, OAuth or client-trust
   prompts. In `reinstall-preserve-data`, retain the selected data directory
   and wait for the user to finish the interactive installer; never substitute
   silent flags. Afterward use the full setup guide for installed-version,
   service identity, OAuth, host tool discovery and task-specific readiness.
8. Windows checks remaining download space before requesting package bytes.
   On `insufficient_download_space`, report the required and available bytes;
   do not retry a full drive or delete user files.
   On failure, preserve the exact stage/category and inspect only evidence
   relevant to it. Never change publisher trust, bypass permissions, delete
   data/rollback state, or automatically retry an unresolved installer handoff.
   Do not extend an expired plan. A replacement plan must be checked against
   current user authorization; an expired exact-plan-only approval cannot be
   silently renewed. Use only helper-supported cache reuse.

Routine discovery should take one focused pass. If a needed value is unresolved,
name that value rather than restarting the whole checklist. OS/browser consent
is distinct from installation authorization and remains user-operated.
