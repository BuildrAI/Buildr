---
name: current-knowledge-maintenance
description: OpenSpec Change 创建、修订、实现、同步或 Task Finish 前，需要评估、维护、收敛或检查 Change Brief、Project 概览、产品/技术架构、核心流程、Service 说明和术语时使用。
---

# 当前认知维护

本 Skill 是 `buildr.current-knowledge-maintenance/v1` 的默认 provider，并 required 依赖 `buildr.terminology-governance/v1`。它让当前 Change 的真实影响进入人类可读当前认知，不负责补齐与本 Change 无关的全部历史知识。

## 1. 解析 operation 与事实范围

读取 runtime binding 中的 contract 和 selected terminology provider，解析 Workspace、Project、Change、artifact paths、当前 tree identity 与已有 `.buildr/knowledge-impact.yml`。只接受：

- `assess`：proposal/update 阶段评估影响；
- `reconcile`：实现完成、最终验证前收敛内容；
- `inspect`：Task Finish 验证前检查，不把检查冒充验证 execution。

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

没有真实内容就不创建文件。产品架构与技术架构分开；跨视角流程只在 `flows/` 维护完整版本，由架构文档引用。无关历史知识债务进入 follow-up 信号，不扩大当前 Change；会直接导致本 Change 错误的冲突必须处理。

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

核对所有 impacts 已处理、Brief 与权威 artifacts 一致、current knowledge 对应当前 tree、terminology 无 unresolved，并返回 `aligned|not-applicable`；可以建议 fallback reconcile，但不得静默修改后继续沿用旧验证证据。任何 unresolved 必须阻塞 sync、verification、archive、Git integration、push 和 cleanup。

## 6. Result Evidence

返回：

```text
operation: assess | reconcile | inspect
status: aligned | updated | unresolved | not-applicable
change: <id>
project: <id/code>
impacts: <type/target/reason/status>
changedAssets: <paths or none>
unresolvedItems: <items or none>
sourceIdentities: <paths/specs/tree>
treeIdentity: <current candidate identity>
```

Archive 只移动已对齐的 Change、Brief 和 sidecar；archive 后不得再写 glossary 或 current knowledge。

## Guardrails

- 不生成空文档，不把 archive 当当前事实源。
- 不修改 external `openspec-*` Skill 源；通过 capability binding 与 Component contribution 组合。
- 不把 Brief、knowledge、task board 或 sidecar变成第二套规范。
- 不接管 Agent 的理解、检索、推理和任务执行。
