---
name: terminology-governance
description: Agent 在探索、提案、设计、实现或文档整理中遇到新术语、同义词、一词多义、中英不一致、Context/Context Window 等概念边界，或 consumer 需要正式术语对齐 evidence 时使用。
---

# 术语治理

本 Skill 是 `buildr.terminology-governance/v1` 的默认 provider。它维护人和 Agent 共用的长期术语边界，不负责替代领域建模、OpenSpec 规范或用户对长期语义的最终判断。

## 1. 解析范围与权威来源

- 读取 runtime binding 中的 contract、Workspace 与明确 Project context；不得按当前目录猜测 Project。
- Project canonical glossary 固定解析为 `<project-root>/knowledge/glossary.md`。Service 特有术语可以位于 `<project-root>/knowledge/services/<service-code>.md` 的“局部术语”小节。
- Task 不创建独立 glossary。Project term 优先于 Service 局部表达；Service 若有不同含义，必须显式说明作用域及与 Project term 的关系。
- 按 canonical specs、当前实现/registries、current knowledge、active Change artifacts、已确认用户决定的顺序调查；archive 只用于追溯理由。

## 2. 先调查再询问

对本次术语集合检查：canonical 名称、中文/英文、定义、作用域、同义词、一词多义、翻译差异、新概念、过时别名和所有权边界。

可从代码和资产确认的内容由 Agent 自行调查，不询问用户。只有不同答案会改变长期领域模型、公开产品模型、数据语义、作用域、所有权或责任边界时才提出最少问题。难以逆转的决定建议进入当前 OpenSpec design 或 ADR；不强制固定 ADR 工具。

## 3. 维护 canonical terms

只有 consumer 已授权当前任务范围内的 knowledge 写入，且定义已确认时才能写入。Project glossary 条目至少包含：

```markdown
## <中文名称>（<English Name>）

- 定义：...
- 适用范围：...
- 避免混用：...
- 来源：...
```

没有已确认长期术语时不得为形式完整创建空 glossary。位于 Workspace 的普通文件、依赖、临时内容或本机配置不会因此自动成为 Buildr Work Asset；任务使用的数据库/API/网页结果也不会自动进入 glossary。

## 4. 返回结果

返回：

```text
status: aligned | updated | unresolved | not-applicable
termsConsulted: <核对的术语>
canonicalTerms: <名称、定义与 scope>
changedAssets: <实际修改路径；无则 none>
unresolvedConflicts: <冲突与最少决策问题；无则 none>
sourceIdentities: <spec/change/file/tree identities>
```

`aligned` 表示已核对且无需写入，`updated` 表示确认后的 canonical 资产已更新，`unresolved` 必须阻塞 required consumer，`not-applicable` 表示当前工作没有长期术语影响。不得把 provider readiness 或文件存在误报为本次行为成功。

## Guardrails

- 不把 glossary 当作规范行为事实源。
- 不把所有对话用词机械写入长期资产。
- 不修改 archived Change，不在 archive 后补写术语。
- 不把 `rg`、`grep`、SQL、语义检索、MCP 或任一工具固化为 Context 模型。
- 不因 Skill id、description 相似或安装顺序猜测 provider/consumer 关系。
