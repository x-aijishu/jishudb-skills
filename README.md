# JishuDB Skills

这是一组围绕 [JishuDB](https://github.com/x-aijishu/jishudb) 的 14 个 Agent Skills，
覆盖安装连接、知识库检索、MCP 验收、行业研究、内容制作和 Plaud 会议归档。
按需要解决的问题和最终产物选择 Skill；安装 Skill 不等于已经连接服务或完成任务。

Fourteen Agent Skill packages for working with
[JishuDB](https://github.com/x-aijishu/jishudb): setup, retrieval, MCP acceptance,
task-oriented content workflows, and Plaud recording import. Choose by the
problem and required deliverable; installing a Skill is not a completed
connection or task.

This repository hosts Skill instructions and their bundled helpers, references,
and fixtures. The JishuDB service and Desktop application are maintained
separately.

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
or recurring runs. Load companion skills through the host's supported loader
only when needed; package names are not assumed sibling filesystem dependencies.

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

## 使用 Skill / Use a Skill

克隆仓库或使用宿主支持的安装器，再通过宿主的 Skill 加载器选择所需包。
务必保留包内的脚本、引用和附件；需要连接 JishuDB 时加载 `jishudb` 配套包。
安装 Skill 不授予应用安装、账户访问、知识库写入或发布权限。

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

## 元数据约定 / Metadata conventions

所有包使用顶层 `name`、中英双语 `description` 和 `compatibility`，
作者与版本保存在 `metadata.author`、`metadata.version`。
`metadata.openclaw.homepage` 是 OpenClaw 的主页展示扩展，其他宿主可能忽略它。
`jishudb-search` 保留旧的 `tags` 和 `slash_command` 提示；
`/kb` 是否注册为命令由宿主决定，不是跨宿主保证。

All packages keep discovery and environment requirements in top-level `name`,
`description`, and `compatibility`, with author and version under `metadata`.
Descriptions use Chinese task phrases followed by `/` and English discovery text.
Each entrypoint includes `Use this skill when` and explicit non-use guidance
before its execution steps.

The `metadata.openclaw.homepage` mapping follows the
[OpenClaw Skill extension](https://docs.openclaw.ai/tools/skills#optional-frontmatter-keys),
not a universal host requirement. The search package retains legacy `tags` and
`slash_command` hints to avoid removing potential host-specific discovery data;
their consumption by legacy clients has not been verified. Do not assume `/kb`
registration from this field. Use the host's supported Skill loader or actual
registered command.

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
