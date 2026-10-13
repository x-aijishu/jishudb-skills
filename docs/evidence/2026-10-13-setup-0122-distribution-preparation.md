# Setup 0.1.22 distribution preparation

The CNB plan continuation verified public release
`task-skills-2026.10.12-cnb.1` and source `c0cbce0dbe7bab9260f271301c8be5bdc90dd354`.
The published setup is 0.1.21; source setup is 0.1.22. All eleven task bundles
already match the latter. Ten task entrypoints still declared the previously
published 0.1.10 despite changed embedded setup behavior, so this change advances
them to 0.1.11. Interview-crash-coach remains at its unpublished 0.1.13.

Validation:

- `npm test`: 141 Node passes, one node-canvas dependency skip; four Python
  passes, eight macOS-dependent skips; all eleven generated bundles verified.
- Review packaging: eleven task ZIPs, standard setup tarball, SkillHub-compatible
  setup ZIP, manifests and checksums (19 files). Every archived task file was
  compared with source; every embedded manifest hash and canonical Windows
  helper matched. All task bundles declare setup 0.1.22.
- Review output: `/tmp/cnb-continue-20261013-q0qgj790/assets`. Manifests explicitly
  mark the dirty source as ineligible for publication. Rebuild from the final
  clean commit before uploading; no package was published during preparation.
- Current Windows WorkBuddy interview-crash-coach: all 12 files match source.
  This is installed-file verification, not host MCP readiness.
- The generic skill-creator frontmatter validator rejected the pre-existing
  `compatibility` extension. The repository's own specification and tests
  require it; it was retained. Generic validation is not reported as passing.
- `git diff --check`: passed.

The skill-creator workflow guided preservation of existing host metadata and
self-contained resources. No installer, OAuth consent, marketplace submission,
or Desktop update was executed by this packaging change.
