---
name: jishudb-search
version: 0.1.0
description: 查询 JishuDB 知识库，基于内部资料/文档作答并标注来源（RAG 检索工具）
author: jishushell-team
tags: [knowledge, rag, search, kb, retrieval]
slash_command: /kb
---

# 知识库检索（JishuDB）

当用户的问题需要**内部资料 / 文档 / 知识库**里的事实，或用户输入 `/kb`、说「查知识库 / 查资料 / 基于文档回答」时，使用本技能先检索、再据检索结果作答。**不要凭空编造**——答案必须来自检索到的片段。

## 请求必须路由到对应工具

- 问“有哪些知识库”、知识库名称、标识或数量：调用 `kb_list`，只按本轮工具结果回答。
- 问某个知识库“有哪些文件”、精确文件名或文件数量：调用 `kb_list_documents`；若返回 `nextCursor`，继续翻页直到结束。只列返回的 `documents`，不得从检索片段、正文、历史对话或任务记录补出文件名。
- 问某个文件的当前状态或元数据：先用 `kb_list_documents` 确认文件，再调用 `kb_get_document`。
- 问某个文件具体写了什么：调用 `kb_read_document_text`；不要仅凭搜索摘要还原全文。
- 问资料中的语义事实：调用 `kb_search`，只依据返回片段综合，并标注来源。搜索结果不是完整文件清单。
- 问导入进度：调用 `kb_list_jobs` 或 `kb_get_job`。任务是处理尝试，同一文件可能对应多条任务，任务数不能当作文件数。
- 对应工具失败或不可用时，如实说明无法核实，不要根据记忆或字段名称猜测。

本技能目录里有一个零依赖脚本 `kb-search.sh`（用 curl 调 KB 的 HTTP API）。KB 地址由环境变量 `JISHUDB_URL` 配置（JishuShell 面板绑定时会自动注入；独立使用时自行 export，默认 `http://host.docker.internal:18089`）；若 KB 开了鉴权，另设 `JISHUDB_TOKEN`。

## 1. 不确定有哪些知识库时，先列出

```bash
bash skills/jishudb-search/kb-search.sh list
```

输出每个库的 `id` / 名称 / 块数。挑一个相关的 `id` 用于检索。

## 2. 检索

```bash
bash skills/jishudb-search/kb-search.sh search "用户的问题或关键词" <kb-id>
```

- 第 3 个参数可选 `topK`（默认 6）。
- 若面板绑定时设了默认库（`JISHUDB_DEFAULT_KB`），可省略 `<kb-id>`，直接：
  ```bash
  bash skills/jishudb-search/kb-search.sh "用户的问题"
  ```

返回形如:

```
Top 6 passages (cite the source filename in your answer):

[1] 01-quick-start.md  (relevance: high)
    JishuShell 是面向 Arm 边缘设备的 AI Agent 管理面板 …

[2] README.md  (relevance: medium)
    …
```

## 3. 据检索结果作答

- **综合**这些片段写出答案，用自己的话组织。
- **标注来源**：在答案里点名引用的文件名（如「据 `01-quick-start.md`…」），或在末尾列出来源。
- 若返回 `No matching passages found`，**如实告知**知识库里没有相关内容，不要编造；可建议换关键词或换一个库（先 `list`）。
- 相关度 `low` 的片段要谨慎使用，必要时说明置信度不高。

## 备注

- 脚本只读、无副作用，可安全多次调用（同一轮可对不同关键词检索几次再综合）。
- 若 `kb-search: curl not found` / 无法连接：说明运行环境缺 curl 或网络不通 KB，提示用户检查 KB 应用是否在面板里处于运行状态。
