# JishuDB Skills

Fourteen Agent Skill packages for working with
[JishuDB](https://github.com/x-aijishu/jishudb): setup, retrieval, MCP acceptance,
task-oriented content workflows, and Plaud recording import.

This repository hosts Skill instructions and their bundled helpers, references,
and fixtures. The JishuDB service and Desktop application are maintained
separately.

## Skill catalog

Every package lives under `skills/<name>/`. Its `SKILL.md` is the entrypoint.

| Skill | Purpose |
| --- | --- |
| [jishudb](skills/jishudb/SKILL.md) | Install, locate, connect, or troubleshoot JishuDB |
| [jishudb-search](skills/jishudb-search/SKILL.md) | Retrieve knowledge with citations and a bundled HTTP search wrapper |
| [jishudb-mcp-check](skills/jishudb-mcp-check/SKILL.md) | Run an explicitly authorized MCP smoke or all-tools acceptance workflow |
| [ppt-rescue-kit](skills/ppt-rescue-kit/SKILL.md) | Produce an editable presentation with sources and speaker notes |
| [xiaohongshu-content-factory](skills/xiaohongshu-content-factory/SKILL.md) | Create finished posts, titles, and actual cover images |
| [polished-website-builder](skills/polished-website-builder/SKILL.md) | Build editable, working local website files |
| [interview-crash-coach](skills/interview-crash-coach/SKILL.md) | Prepare company-and-role research and interactive interview practice |
| [industry-report-sprint](skills/industry-report-sprint/SKILL.md) | Write a source-cited industry research report |
| [research-report-hunter](skills/research-report-hunter/SKILL.md) | Find and prioritize reports with honest access and coverage labels |
| [data-evidence-finder](skills/data-evidence-finder/SKILL.md) | Find citable figures, statistical scope, and contradictory or missing evidence |
| [end-to-end-industry-presentations](skills/end-to-end-industry-presentations/SKILL.md) | Create an editable industry presentation with slide-to-source mappings |
| [report-to-content-factory](skills/report-to-content-factory/SKILL.md) | Turn report evidence into original articles, posts, and video scripts |
| [industry-opportunity-radar](skills/industry-opportunity-radar/SKILL.md) | Compare industry evidence over time and record opportunity hypotheses |
| [jishudb-plaud-import](skills/jishudb-plaud-import/SKILL.md) | Archive selected audio, transcripts, and summaries with stable source associations |

## Use a Skill

Clone this repository or use your host's supported repository-based Skill
installer:

```sh
git clone https://github.com/x-aijishu/jishudb-skills.git
```

Select the desired package with the host's Skill loader. Keep the entire
directory, including any `references/`, `scripts/`, `assets/`, and standalone
helper files; copying only `SKILL.md` can omit required resources. Preserve
executable permissions and the exact MCP fixture bytes.

Read the selected entrypoint before running its helpers. Helper paths are
relative to their package unless the instructions explicitly show a
repository-root command.

Task workflows require JishuDB as their persistence backend. Reuse an existing
authorized connection; if setup is needed, also load the `jishudb` companion
package. Installing a Skill does not authorize application installation, account
access, knowledge-base writes, publishing, or recurring execution.

The host must provide the browsing, file output, presentation, graphic, or
source-connector capabilities required by the selected workflow. Missing tools
must not be disguised as completed deliverables. Personal interview practice
requires separate retention approval, and recurring radar runs require an
actual authorized host scheduler.

## Service and release boundaries

This repository does not contain or deploy the JishuDB backend, Desktop
application, models, or runtime binaries. Desktop installation helpers retain
their original fixed trust inputs:

- Source repository: `x-aijishu/jishudb`
- Desktop release repository: `x-aijishu/jishudb-desktop-releases`

Do not replace those installer targets with this Skills repository. Follow the
packaged installation contract and its approval, platform, and authorization
gates.

Plaud imports require an authorized source connection or an explicitly selected
local export. Audio additionally requires a compatible deployed JishuDB
write-capable HTTP direct-upload connection and enabled speech service;
MP3/M4A require its configured decoder. Copying these packages does not establish
real-account, host, or mainland-network compatibility.

## Import provenance

The initial import preserves the complete `skills/` tree from the JishuDB source
snapshot `d4e35449e70f412c8178c495becb85897ca31c87`, including helper scripts,
references, and binary fixtures. The original source packages remain in place;
this import does not configure automatic synchronization between repositories.

Service-source paths quoted in provenance records, such as
`docs/contracts/jishudb-mcp-v2.json`, refer to the JishuDB source repository,
not missing local runtime dependencies. The MCP acceptance package includes
its own contract baseline and fixtures.

## License

[Apache License 2.0](LICENSE). See [NOTICE](NOTICE) for upstream attribution.
