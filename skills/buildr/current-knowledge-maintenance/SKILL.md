---
name: current-knowledge-maintenance
description: OpenSpec Change 创建、修订、实现、同步或 Task Development 形成稳定 Content Target 前需要评估、收敛或检查当前认知，或者没有 Change 但需要让 Project 概览、架构、流程、Service 说明和术语追上已确认当前事实时使用。
---

# 当前认知维护

本 Skill 同时是 `buildr.current-knowledge-maintenance/v1` 与 `v2` 的默认 provider，并 required 依赖 `buildr.terminology-governance/v1`。v1 保持 Change lifecycle 的 `assess`、`reconcile`、`inspect`；v2 另外支持不依附 Change 的 `maintain`，让已确认当前事实进入人类可读当前认知。

## 1. 解析 operation 与事实范围

读取 runtime binding 中与 operation 匹配的 contract 和 selected terminology provider，解析 Workspace、Project、当前 tree identity 与授权范围。Change lifecycle operations 另外解析 Change、artifact paths 与已有 `.buildr/knowledge-impact.yml`。只接受：

- `assess`：proposal/update 阶段评估影响；
- `reconcile`：实现完成、最终验证前收敛内容；
- `inspect`：针对current tree在实现、Review或Verification前后形成完成影响分类，不把检查冒充验证execution；
- `maintain`：没有 Change 时，让 current knowledge 追上已由权威来源确认的既有事实。

事实顺序是 canonical specs → 当前实现与 registries → active Change artifacts → 已确认 evidence/用户决定 → archive provenance。冲突时先修正权威资产，再更新解释性 knowledge。

## 2. 按真实影响选择目标

| 目标 | 触发事实 |
|---|---|
| `brief.md` | 每个正式 Change；scope、流程、影响或验收变化 |
| `overview.md` | Project 定位、用户、核心能力或全局入口 |
| `architecture/product.md` | 角色、业务能力、领域模块、产品边界或信息架构 |
| `architecture/technical.md` | Service 拓扑、模块边界、数据所有权、接口依赖、runtime、部署或安全 |
| `flows/<flow-id>.md` | 用户旅程、业务状态、跨模块/Service 顺序或关键异常 |
| `services/<service-code>.md` | Service 职责、API/事件、数据、依赖、配置或运行要求 |
| `glossary.md` | 新增、重定义、重命名、歧义、中英不一致或所有权变化 |

没有真实内容就不创建文件。产品架构与技术架构分开；跨视角流程只在 `flows/` 维护完整版本，由架构文档引用。Change lifecycle 中，无关历史知识债务进入 follow-up 信号，不扩大当前 Change；会直接导致本 Change 错误的冲突必须处理。`maintain` 只处理 consumer 明确授权的 targets，不扩大全量知识审计。

## 3. Assess

检查 proposal、design、delta specs、tasks 和现有 knowledge，创建或更新 Brief，并把真实 impacts 转成 tasks。可在 Change 内维护：

```yaml
schemaVersion: buildr.knowledge-impact/v1
change: <change-id>
operation: assess
treeIdentity: <identity or planning>
impacts:
  - type: brief|overview|product-architecture|technical-architecture|flow|service|glossary
    target: <relative path>
    reason: <confirmed reason>
    status: pending|aligned|updated|unresolved|not-applicable
    sourceIdentities: []
unresolvedItems: []
```

Sidecar 只是 workflow evidence，不是事实源。不把 `not-applicable` 目标转换为空文档任务。

## 4. Reconcile

在最终验证前逐项核对最终 specs、实现、registries、Brief 与 current knowledge；调用 selected terminology provider 处理术语。只更新受影响资产，记录真实 changed paths 和 source identities。若写入改变 delivery content，调用方必须使旧 verification evidence 失效。

Brief 固定表达：一句话摘要、背景与问题、目标/非目标、受影响用户或角色、核心流程、关键变化、影响/风险/兼容性、验收摘要和技术 artifacts 入口。用户故事按需使用，不为填模板虚构角色或流程。Brief 不支持的新行为必须先进入 proposal/design/spec。

## 5. Inspect

核对所有impacts、Brief、权威artifacts、current knowledge、current tree与terminology，并按当前Task完成结论影响返回`aligned|not-applicable|attention|blocked`。只有冲突会导致handoff遗漏必要行为、风险、兼容性或验收事实时返回`blocked`与最小unresolved items；解释性漂移、无关历史债务或不改变当前行为/authority的缺口返回`attention`与portable follow-up。不得把attention升级为全局blocked，也不得静默修改后沿用旧bytes绑定的证据。

## 6. Maintain

`maintain` 不创建或要求 OpenSpec Change。consumer 必须提供 Project、明确 targets、fact sources、knowledge 写入授权和当前 tree identity；provider 按事实顺序核对来源，并调用 selected terminology provider 处理适用术语。

- 事实已确认且文档无需变化：返回 `aligned`。
- 事实已确认且目标缺失、陈旧或表述错误：只更新真实受影响 targets，返回 `updated`。
- authority 冲突、授权不足或 tree identity 不匹配：不写入，返回 `unresolved` 和最少决策问题。
- 候选内容会改变 SHALL/MUST、API、状态流、权限、业务规则、数据语义、兼容性或其他可观察承诺：不写入，返回 `change-required`，由 consumer 重新进入 task triage/change-flow。
- 没有真实 current knowledge 影响：返回 `not-applicable`，不创建空文档。

`maintain` 不创建 Brief、`.buildr/knowledge-impact.yml` 或 archive provenance，也不修改 specs、实现、registries 或 archived Change。写入改变 delivery content 后，consumer 必须使旧 verification evidence 失效。

## 7. Result Evidence

返回：

```text
operation: assess | reconcile | inspect | maintain
status: aligned | updated | unresolved | not-applicable | change-required | attention | blocked
change: <id | none>
project: <id/code>
impacts: <type/target/reason/status>
targets: <maintain targets or none>
changedAssets: <paths or none>
unresolvedItems: <items or none>
sourceIdentities: <paths/specs/tree>
treeIdentity: <current candidate identity>
```

Development聚合时只保存`aligned|not-applicable|attention|blocked`、tree identity、summary、source identities与bounded unresolved items。多Project Task必须逐Project取得Result并提交精确覆盖全部有效Project的dispositions；不得让一个Project结果代表整个Task。`updated`后必须重新观察新tree，`unresolved|change-required`按是否会造成错误完成结论转为blocked或先回到Change flow，不能伪装aligned。Archive只移动已对齐的Change、Brief和sidecar；archive后不得再写glossary或current knowledge。

## Guardrails

- 不生成空文档，不把 archive 当当前事实源。
- 不为独立 `maintain` 补造 Change、Brief 或 sidecar。
- 不用 current knowledge 写入替代新业务语义的 change-flow。
- 不修改 external `openspec-*` Skill 源；通过 capability binding 与 Component contribution 组合。
- 不把 Brief、knowledge、task board 或 sidecar变成第二套规范。
- 不接管 Agent 的理解、检索、推理和任务执行。
