<!-- 需要素材：assets/jishudb-skills-banner.png -->

# JishuDB Skills

[![License](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

**把知识检索、研究和内容生产变成 Agent 可以直接发现和调用的任务入口。**  
**Discoverable Agent Skills for JishuDB setup, knowledge retrieval, MCP checks, research, presentations, websites, and content workflows.**

本仓库包含 14 个围绕 JishuDB 的 Agent Skills，覆盖安装连接、知识库检索、MCP 验收、行业研究、内容制作和 Plaud 会议归档。

This repository contains 14 Agent Skills for JishuDB setup, retrieval, MCP acceptance, research, content production, and Plaud meeting archival.

[JishuDB](https://github.com/x-aijishu/jishudb) · [Desktop Releases](https://github.com/x-aijishu/jishudb-desktop-releases) · [AIJISHU](https://aijishu.com/)

<!-- 若 JishuDB 保持私有，建立公开产品页后替换上方 JishuDB 链接。 -->


<img src="./assets/JishuDBSkillsBanner.png" alt="JishuDB Skills" width="100%">

## 什么时候使用这个仓库 / Use this repository when

当用户希望 Agent 完成以下任务时，可以在本仓库中选择对应 Skill：

- 安装 JishuDB，连接 MCP，或排查 Agent 无法访问知识库的问题
- 搜索 JishuDB 中已有的文件、知识和导入状态，并保留来源
- 对已经配置的 JishuDB MCP 连接执行冒烟测试或完整验收
- 查找研报、核验数据，或撰写带引用的行业分析
- 根据研究资料制作 PPT、网站、公众号、小红书或短视频文稿
- 准备面试、跟踪行业机会，或归档 Plaud 会议资料

Use this repository when an Agent needs to set up or search JishuDB, validate a
JishuDB MCP connection, discover research reports, verify statistics, create
source-grounded analysis, build presentations or websites, adapt research into
content, prepare interviews, monitor an industry, or archive Plaud material.

Each Skill is a standalone task package with a `SKILL.md` entrypoint and any
required scripts, references, assets, or fixtures. Select by the user's primary
goal and expected deliverable rather than loading every package that shares a
keyword.

## 选择 Skill / Choose a skill

每个包位于 `skills/<name>/`，以 `SKILL.md` 为入口。可以只安装所需的包。
Every package lives under `skills/<name>/`. Its `SKILL.md` is the entrypoint.

| Skill | 使用场景 / Use when |
| --- | --- |
| [jishudb](skills/jishudb/SKILL.md) | 首次安装、找不到服务、连接 Agent、MCP 连接或授权失败。Install, locate, connect, or troubleshoot JishuDB. |
| [jishudb-search](skills/jishudb-search/SKILL.md) | 查内部资料、列出文件、阅读文档或查看导入进度。Query existing knowledge, inspect files, and check import status with source-grounded answers. |
| [jishudb-mcp-check](skills/jishudb-mcp-check/SKILL.md) | 明确要求测试已配置的 MCP，生成冒烟或全工具验收报告。Run explicitly requested MCP smoke checks or isolated all-tools acceptance. |
| [ppt-rescue-kit](skills/ppt-rescue-kit/SKILL.md) | 工作汇报、项目提案、知识分享或补完 PPT，交付可编辑文件及讲稿。Create or rescue a general-purpose editable presentation with notes and sources. |
| [xiaohongshu-content-factory](skills/xiaohongshu-content-factory/SKILL.md) | 制作小红书完整文案、标题和实际封面图片。Create complete Xiaohongshu posts and usable cover files, without publishing. |
| [polished-website-builder](skills/polished-website-builder/SKILL.md) | 制作可本地打开和编辑的产品落地页、演示页或展示站。Build responsive local website files, not just a design proposal. |
| [interview-crash-coach](skills/interview-crash-coach/SKILL.md) | 根据公司和岗位做面试准备、题目练习和逐题模拟，无需简历。Prepare company-and-role research and interactive mock interviews without a resume. |
| [industry-report-sprint](skills/industry-report-sprint/SKILL.md) | 撰写带引用的行业分析、竞争格局和产品对比报告。Write a complete source-cited industry research report and comparison matrix. |
| [research-report-hunter](skills/research-report-hunter/SKILL.md) | 找研报、白皮书及近期报告，筛选值得读的资料。Discover and prioritize reports with links and honest access labels. |
| [data-evidence-finder](skills/data-evidence-finder/SKILL.md) | 查市场规模、增长率、数据来源及统计口径，验证或反驳观点。Find citable figures, verify measurement scope, and preserve conflicting evidence. |
| [end-to-end-industry-presentations](skills/end-to-end-industry-presentations/SKILL.md) | 从查研报、核对数据到生成行业分析 PPT，包含逐页来源和图表数据。Research and generate an editable industry deck with slide-to-source mappings. |
| [report-to-content-factory](skills/report-to-content-factory/SKILL.md) | 将研报证据转化为公众号文章、小红书文案及短视频脚本。Turn research into original content drafts with citations and visual suggestions, not required cover files. |
| [industry-opportunity-radar](skills/industry-opportunity-radar/SKILL.md) | 比较历史与当前行业证据，输出变化、机会假设及风险。Establish a monitoring baseline or compare saved evidence over time. |
| [jishudb-plaud-import](skills/jishudb-plaud-import/SKILL.md) | 将选定的 Plaud 音频、转写或会议纪要归档，并在导入后检索或对比。Archive selected Plaud material with stable source associations and cited follow-up analysis. |

## 相近任务如何区分 / Route overlapping requests

先按主要产物选择 Skill；提到“行业”“报告”或“PPT”并不意味着所有相关包都要运行。
若明确要求多个产物，按各自范围组合流程，不因分流而遗漏交付项。
下面的分流不授予安装、写入、发布或定期执行权限。

Choose by the primary deliverable, not a shared keyword. For explicitly
requested multi-artifact work, combine the relevant scopes without dropping
deliverables. These routes do not authorize installation, writes, publishing,
or recurring runs. Task packages include setup resources under
`references/jishudb-setup/`; use them only when a working connection is absent.
Other companion skills still require the host's supported loader.

| 需求区别 / Distinction | 首选 Skill / Preferred route |
| --- | --- |
| 首次连接或修复连接，而非主动验收。Initial setup or connection repair versus an explicit acceptance run. | 连接 / Connect: `jishudb`; 验收 / Acceptance: `jishudb-mcp-check`. |
| 查已有知识，而非寻找外部研报。Existing knowledge versus external report discovery. | 已有资料 / Existing material: `jishudb-search`; 外部研报 / External reports: `research-report-hunter`. |
| 找报告清单，而非写一份新报告。A reading list versus a newly written report. | 阅读清单 / Reading list: `research-report-hunter`; 分析成稿 / Written analysis: `industry-report-sprint`. |
| 核对具体数字，而非比较历史变化。Verify a statistic versus compare evidence snapshots. | 数据证据 / Statistics: `data-evidence-finder`; 持续观察 / Monitoring: `industry-opportunity-radar`. |
| 通用演示稿，而非研报驱动的行业分析演示稿。General slides versus a report-led industry deck. | 通用 PPT / General deck: `ppt-rescue-kit`; 行业 PPT / Industry deck: `end-to-end-industry-presentations`. |
| 研报改编文稿，而非必须提供小红书成品封面。Research-based drafts versus posts with finished covers. | 文稿与脚本 / Drafts and scripts: `report-to-content-factory`; 文案加封面 / Posts and covers: `xiaohongshu-content-factory`. |
| 导入 Plaud 会议，而非仅查询已经归档的资料。Import a Plaud meeting versus query archived material only. | 导入 / Import: `jishudb-plaud-import`; 只读查询 / Retrieval only: `jishudb-search`. |

## 可以这样提问 / Example searches

这些示例说明任务匹配，不替代各 Skill 的能力检查与授权步骤。
These examples illustrate task selection, not permission to skip capability
checks or approval.

| Skill | 中文示例 / Chinese example | English example |
| --- | --- | --- |
| `jishudb` | JishuDB 已经安装，但 Agent 连不上 MCP，帮我排查连接。 | JishuDB is installed, but my agent cannot connect to MCP. Diagnose the connection. |
| `jishudb-search` | 查知识库里的产品文档：支持哪些导入格式？标注来源。 | Search the product docs in JishuDB for supported import formats and cite the sources. |
| `jishudb-mcp-check` | 对已配置的 JishuDB MCP 做一次只读冒烟测试，给我验收报告。 | Run a read-only smoke test on the configured JishuDB MCP connector and report the results. |
| `ppt-rescue-kit` | 明天要汇报项目进展，帮我做一份可编辑 PPT，附讲稿。 | Turn my project update into an editable PowerPoint with speaker notes. |
| `xiaohongshu-content-factory` | 围绕家庭收纳做三篇小红书笔记，包含完整文案和能用的封面图，不要发布。 | Create three home-organization posts with finished Xiaohongshu cover images, without publishing. |
| `polished-website-builder` | 为这个产品做一个手机和电脑都能看的落地页，我要能本地打开和修改。 | Build a responsive product landing page that I can open and edit locally. |
| `interview-crash-coach` | 我要面试一家新能源汽车公司的产品经理，先做岗位准备，再逐题模拟面试。 | Prepare me for a product-manager interview at an EV company, then practice one question at a time. |
| `industry-report-sprint` | 写一份中国储能行业分析报告，比较代表产品、竞争差异和进入壁垒。 | Write a cited report on China's energy-storage sector, comparing products, competitors, and barriers. |
| `research-report-hunter` | 找最近两年的低空经济研报，列出值得读的报告、日期、链接和全文可用性。 | Find recent low-altitude economy reports and rank them with dates, links, and access labels. |
| `data-evidence-finder` | 找中国宠物市场规模和增长率的原始数据，核对统计口径并给出引用。 | Find original figures for China's pet-market size and growth, checking definitions and citations. |
| `end-to-end-industry-presentations` | 从查研报开始做一份机器人行业 PPT，要有可编辑图表和逐页数据来源。 | Research robotics reports and create an editable industry deck with chart data and slide citations. |
| `report-to-content-factory` | 把这份消费趋势研报改编成公众号文章、小红书文案和 90 秒口播脚本。 | Turn this consumer-trends report into a WeChat article, Xiaohongshu post, and 90-second video script. |
| `industry-opportunity-radar` | 对比上次保存的储能行业基线，说明这次有哪些变化、机会假设和风险。 | Compare current energy-storage evidence with the saved baseline and explain changes, hypotheses, and risks. |
| `jishudb-plaud-import` | 把我选中的 Plaud 会议录音和已有转写导入指定知识库，再对比项目需求。 | Import my selected Plaud recording and existing transcript into the chosen KB, then compare project requirements. |

## Quick Start / 快速开始

```bash
git clone https://github.com/x-aijishu/jishudb-skills.git
```

通过宿主支持的 Skill 加载器选择所需包。必须保留完整目录，包括 `references/`、`scripts/`、`assets/`、Fixtures 和辅助文件。

Use the host's supported Skill loader and keep each full package. Copying only `SKILL.md` can omit required resources.

<!-- 缺少：按已验证宿主分别编写的公开安装教程和 Skill 市场集合页。 -->

## JishuDB Dependency

任务型 Skills 已内置 JishuDB 安装连接资源。已有授权连接时直接复用；没有连接时使用包内指南，不再要求另装 `jishudb` Skill 或从 ClawHub 下载依赖。

Task workflows use JishuDB as their knowledge and persistence backend. All 11
task packages include the setup guide, connection recovery, installation contract,
and platform helpers under `references/jishudb-setup/`. Installing just one task
package is sufficient to access these resources; no separate setup Skill or
ClawHub fetch is required. Reuse a working connection; otherwise follow the
included guide, complete approved installation and user-operated OAuth, verify
runtime readiness, then resume the task. This still requires a supported local
host and an eligible Desktop release. A cloud Agent cannot install a user's PC.

The canonical implementation remains `skills/jishudb/`. Bundles contain generated
copies, not independently maintained installers. The macOS helper is rendered as
`.sh` and invoked with `zsh`, using the existing SkillHub distribution renderer.
Each bundle records its source Skill version and file hashes; it has no nested
`SKILL.md` to confuse host discovery. To update shared setup resources:

```sh
npm run bundle:setup
npm run check:setup
npm test
```

Commit regenerated bundles with changes to canonical setup resources. CI rejects
missing or stale copies. Preserve the entire task directory when packaging or
installing; distributing only its top-level `SKILL.md` omits required resources.
The standalone `jishudb-search` and `jishudb-mcp-check` packages keep their existing
authorized-connection prerequisites.

For explicitly approved macOS prerelease rehearsals, setup 0.1.12 also accepts an
exact candidate tag and source revision in `plan` mode. See the
[candidate installation contract](skills/jishudb/references/installation-contract.md#explicit-macos-candidate-rehearsal).
This is opt-in: task invocation alone still selects stable releases. Windows
candidate selection is not included.

## Permissions and Boundaries / 权限与边界

安装 Skill 不授予：

- 应用安装和账户访问权限
- 知识库写入权限
- 发布权限
- 定期执行权限
- 将未完成任务报告为成功的权限

The host must provide the browsing, file, presentation, graphic, or connector capabilities required by the selected workflow. Missing tools must be reported explicitly.

## Metadata and Development / 元数据与开发

- 顶层使用 `name`、中英双语 `description` 和 `compatibility`
- 作者与版本位于 `metadata.author` 和 `metadata.version`
- `metadata.openclaw.homepage` 仅是 OpenClaw 扩展
- 不应假设所有宿主都会注册遗留 `slash_command`

本仓库不包含 JishuDB 后端、Desktop 应用、模型或运行时二进制。

## Skill authoring standard

新增或较大幅度修改 Skill 时，遵循
[`docs/SKILL_SPEC.md`](docs/SKILL_SPEC.md) 的统一结构，并从
[`templates/SKILL.template.md`](templates/SKILL.template.md) 开始。现有 Skill
在被实质修改时逐步迁移，
无需为了格式一次性重写。规范固定三层顺序：供人快速判断的摘要、供 Agent 执行的流程、
以及文件末尾供全文检索的 Discovery 附录；自动发现仍以前置 YAML `description` 为准。

For new or substantially revised Skills, follow the shared
[`docs/SKILL_SPEC.md`](docs/SKILL_SPEC.md) and start from
[`templates/SKILL.template.md`](templates/SKILL.template.md). Existing Skills
migrate when they are materially touched rather than through a formatting-only
rewrite.

All fourteen Skills now use the quick-scan table, Agent workflow, and final
Discovery appendix. Keep that structure when updating existing packages.

Review the Skill from its packaged directory and verify every linked reference,
script, asset, capability claim, authorization boundary, and completion check.

## Import Provenance

初始导入保留了 JishuDB 源快照 `d4e35449e70f412c8178c495becb85897ca31c87` 中完整的 `skills/` 树、辅助脚本、引用和二进制 Fixtures。

## License

[Apache License 2.0](LICENSE). See [NOTICE](NOTICE) for attribution.

## About AIJISHU

Built by [AIJISHU](https://aijishu.com/) — practical AI tools for knowledge, agents, evaluation, and real-world development.

## Development and validation

This repository is the source of truth for Skill content, installer helpers,
packaging, and Skill-specific tests. JishuDB Desktop and service implementation
and release producer checks remain in the application repository.

Run `npm test` with Node.js 22 or later, Python 3, Git, and GNU tar on Linux.
This checks helpers, packaged resources, API tool references, and reproducible
standard/SkillHub distributions. On Windows, run
`node --test scripts/jishudb-install-windows-helper.test.mjs` and
`./scripts/windows-check.ps1` with Node.js, Python, and Git available. Native
Windows checks create only temporary compatibility evidence, not an installation.
Set `JISHUDB_RUN_LIVE_SKILL_PLAN=true` only for an intentional read-only release
plan check; execution and installation are never part of CI.

Package the reviewed installation Skill from a clean checkout:

```sh
npm run package:jishudb-skill -- --output-dir /tmp/jishudb-skill-dist
npm run package:jishudb-skillhub -- --output-dir /tmp/jishudb-skillhub-dist
```

`--allow-dirty` is for local validation only; its manifest is not eligible for
publication. The complete package includes the connection recovery reference.

The offline [MCP contract snapshot](docs/contracts/jishudb-mcp-v2.json) is copied
unchanged from `docs/contracts/jishudb-mcp-v2.json` at JishuDB revision
`71e8dfae434f93df6fb8ea34ddda8421a1529968`. Update it deliberately with the consumer
contract baseline when supported APIs change; it is not a live-server capability
claim. No test requires a neighboring JishuDB checkout.
