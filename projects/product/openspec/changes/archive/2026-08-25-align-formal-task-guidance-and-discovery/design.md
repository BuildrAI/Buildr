## Context

当前三个问题都发生在既有 authority 之间的 Agent handoff：Verification pre-admission 尚无 Execution Record，因此 compact schema 合法地没有 recovery pointer；Environment Plan request 的校验器存在，但 CLI 未暴露输入发现；Parent startup projection 在 Acceptance 后仍优先返回 coordination next，遮蔽了同次 Task Development read model 的后续动作。

约束是保持现有 capability topology、公共 schema major、持久化模型和专业 writer 不变。

## Goals / Non-Goals

**Goals:**

- 让 Agent 从 compact failure 得到唯一、安全且无副作用的下一步。
- 让 Plan record 的 schema/example 与实际 parser/validator 同源。
- 让 Parent Acceptance 完成后 `task next` 继续显示 Development 的真实动作。
- 用聚焦测试保护 CLI、JSON 与组合行为。

**Non-Goals:**

- 不把 `planRequest` 塞入 compact summary，也不扩展 recovery pointer。
- 不新增恢复 authority、Execution Record、Receipt 字段或自动重试。
- 不改变 Parent Acceptance、Candidate、Verification Result 或 Finish 的 writer/门禁。
- 不替 Agent 生成或记录 Environment Plan。

## Decisions

### 1. preparation blocked 通过同一 invocation 的 full 投影降级

`compactVerificationExecution` 对 `verification.preparation_blocked` 生成专用、可操作的 `primaryFailure.message`，要求保留原参数并追加 `--detail full`。`recovery` 仍只在已有 `recordId` 时出现；full payload 继续承载既有 `admission.recovery.planRequest`。

选择该方式是因为此时尚无 durable identity，不能伪造符合 recovery pointer closed contract 的 owner/record。备选方案“扩展 compact recovery”会混淆结果恢复和输入发现，予以拒绝。

### 2. Plan request 定义成为 parser 与 discovery 的单一来源

从现有 Task Environment Plan request normalizer/validator 导出静态 JSON Schema 与 canonical example。`plan record --schema|--example` 在解析 Task ID、target 或 input 之前直接返回该静态定义；两个选项互斥，也与 `--input` 互斥。正常 record 路径继续只接受文件输入并调用原 Application。

不从帮助文本手写第二份 schema，避免声明与校验漂移；discovery 不 compose runtime、不读取 Workspace。

### 3. current Acceptance 令 Parent startup next 为空

Parent startup readiness 继续报告 ready/status/checks，但当 prerequisites satisfied 且 `parentAcceptance.planIdentity === plan.identity` 时不再生成 `accept-parent`。Task Entry 现有组合逻辑只在 Parent next 非空时覆盖 Development next，因此会自然保留 Development 的 typed next。

不在 Parent 层硬编码 `observe`、`finish` 等后续动作，因为这些动作属于 Task Development 当前状态推导。

### 4. Skill 只消费产品事实

`task-verification` 说明 compact/full 降级，`task-environment` 优先使用 schema/example 形成临时 Plan input，`task-development` 在 current Acceptance 后继续消费 `task next`。Skill 不复制 schema、不直接写专业 Receipt。

## Risks / Trade-offs

- [调用方可能把 full 当默认输出] → 文档限定仅在 preparation blocked 且需要 `planRequest` 时对同一 invocation 使用。
- [Schema 与 runtime validation 边界被误解] → discovery 明确静态结构与 current Task/Environment 运行态校验分离。
- [Parent startup `next: null` 被误认为流程结束] → 组合测试证明顶层 `task next` 保留 Development next，Skill 要求继续消费它。
- [旧脚本依赖 plan record 缺少 Task ID 即报错] → 正常 `--input` 路径不变；新增发现参数是兼容扩展。

## Migration Plan

无需数据迁移。发布新 CLI/Skills 后立即生效；回滚代码即可恢复旧引导，不影响已保存的 Task、Environment、Development 或 Verification facts。

## Open Questions

无。
