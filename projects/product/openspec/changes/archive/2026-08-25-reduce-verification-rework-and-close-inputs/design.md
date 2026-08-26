## Context

复盘中的两个问题都发生在正式 authority 之间的交接处：`Task Development` mutation 需要 Task/Environment/Change/declaration 的 current facts，但 driver 只提供静态 `schema/example`；开发期 `Task-affected` 又容易和后续 `Formal Verification` 各自启动一次。现有 `Task Verification` 已具备 closed `Verification Plan`、`Execution Record` 与 exact invocation de-duplication，适合收窄交接而不是新增一套记录。

## Goals / Non-Goals

**Goals:**

- 提供一个只读、response-only 的 `task-development discover`，从 Application 的 current read model 生成 `observe/policy` 可用的 closed `inputJson`。
- 让 discovery 与 mutation 共用同一套 Task Development 校验和 declaration observer；mutation 仍在写入前重新校验 current facts。
- 规定 `Task-affected` preview/feedback 与 Formal Verification 的复用边界：同一正式请求优先复用 `Verification Plan`，正式 execution 仍只由 `Execution Record`/Result authority 形成证据。
- 将 consumer coverage 约束在 focused regression 与诊断，不增加通用 hard gate。

**Non-Goals:**

- 不自动跳过 Formal Verification，不把 transient feedback 转成 Result，不改写 Result/Execution Record authority。
- 不新增 Development/Verification sidecar、数据库表、历史 backfill 或 Product-specific capability hardcode。
- 不重构 Project verification registry，也不建设新的测试 planner。

## Decisions

### 1. 增加 response-only `discover` action

在现有 Task Development driver 增加 `discover` action，输入只指定 `observe` 或 `policy`。Application 读取 matching Task、ready Environment、current Development Receipt 与 Task Verification declaration read model，返回版本化 envelope、`inputJson`、来源 identity 和必要诊断；不调用任何 writer。选择该入口是因为它复用既有 authority，且不会把动态事实塞入静态 schema 或 Receipt。

`observe` input 直接取 current Receipt 的完整 Change dispositions 与 planning target。`policy` 在已有 policy 与 declaration identities current 时复用已保存的 capabilities、coverage gaps 和 overrides；否则按 declaration 中 `usableFor: task-delivery` 的默认能力生成，Project 无可用能力时生成对应 `project:<code>` coverage gap。返回的 input 仍交给原 `observe/policy` mutation 做最终 fail-closed 校验。

### 2. Plan-first，Formal execution single-writer

开发期需要 broad affected 反馈时，先生成或消费 `Verification Plan`，把它作为后续 Formal Verification 的 exact plan input；如果只需要局部反馈，则执行不与正式计划等价的 focused transient check。正式阶段使用同一 closed plan 调用 `verification run`，由现有 invocation identity 与 Execution Record 复用/去重。任何 feedback 都不能直接 `record/reconcile` 为 Formal Result。

选择复用既有 plan/record 是为了保留 Formal Verification 的独立 authority，并让 identity 变化自然产生新的正式执行；不引入“开发结果可信所以跳过正式验证”的隐式规则。

### 3. Focused consumer coverage

公共 JSON/schema 变更只要求直接 consumer 的 focused regression；需要定位未覆盖 consumer 时输出诊断或测试选择事实。consumer coverage 不作为跨项目通用门禁，也不因未知 owner 自动扩大为 Full Verification。

## Risks / Trade-offs

- [current facts 在 discovery 后可能漂移] → mutation 继续使用现有 Application 校验并在写入前重新观察；discovery 只提供候选输入，不提供授权或 gate。
- [plan-only 与执行时 declaration/target 可能不一致] → Formal execution 仍通过现有 admission、plan identity 与 invocation identity 复核；漂移时阻塞而不重跑或写 Result。
- [默认 policy 可能不符合业务选择] → 仅在没有 current policy 时生成 declaration 默认值；偏离默认仍由原 `overrides` 规则要求显式输入。

## Migration Plan

这是向后兼容的 additive change：旧 driver action 与旧 mutation input 保持不变。先发布 `discover`、Skill 指引和 focused tests，再由 Agent 在后续 Task 中使用；无数据库迁移。回滚时删除 discovery consumer 与 workflow 指引即可，不影响既有 Receipt、Plan、Execution Record 或 Result。

## Open Questions

无。复盘中“是否允许自动跳过 Formal Verification”的边界已按 Core Rule 固定为不允许。
