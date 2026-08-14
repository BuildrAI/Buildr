## Context

Buildr 已通过 Task Record、Environment、Development、Review、Verification 与 Finish 建立清晰 authority，但日常任务的 Agent 引导仍可能把“完整流程最终需要什么”误用为“当前阶段立即读取什么”。结果是 proposal 前上下文装配过重、同一 authority 被反复检索，以及正式验证前缺少低成本的范围预览。

本次只调整 Buildr package 提供的 Skill guidance。专业判断仍由 Agent 基于任务风险和项目事实完成；Application、repository 与正式 Result 继续承担原有 authority。

## Goals / Non-Goals

**Goals:**

- 让 Agent 按当前可执行动作渐进读取 Skill、contract 与 provider。
- 在首次内容修改前建立一次有界 authority source map，后续只在事实变化时增量刷新。
- 在 Project 提供 plan-only/dry-run 入口时，先预览受影响验证范围，再决定补充反馈与正式 capability 组合。
- 将 proposal 启动、重复读取、重复命令和验证耗时作为 retrospective 参考，不变成 workflow gate。

**Non-Goals:**

- 不新增 compact driver、自动 planner、计时器、Application 字段或持久化指标。
- 不改变 Task Development、Task Verification、Review、Finish 或 repository authority。
- 不硬编码所有 Project 都具有 Buildr Product 的 `test:changed` 入口。
- 不允许计划预览替代实际验证 evidence，或据此跳过 required capability。

## Decisions

### 1. 阶段化读取由 Skill 引导，不由产品强制编排

`task-triage` 只要求解析当前决策和下一动作所需的 binding；`task-development` 在进入相应节点时再读取 Review、Verification、current knowledge provider；`task-verification` 在正式验证节点再读取声明与执行参考。这样保持 provider replacement 和 fail-closed contract，同时避免提前加载整个下游生命周期。

替代方案是新增统一 workflow driver 自动计算所有步骤。该方案会把 Agent 的语义判断搬进产品，超出本次“引导优先”的边界，因此不采用。

### 2. source map 是会话内工作方法，不是新 authority

Agent 在修改前从 canonical specs、current knowledge、实现、测试和 registry 中选择与任务直接相关的路径，形成一份简短 map；后续只在 scope 或 authority 发生变化时增量刷新。该 map 不写入 Task Record、Development Receipt 或新的 sidecar，也不能代替源文件事实。

### 3. 验证预览只消费 Project 已有能力

通用 Skill 使用 `plan-only/dry-run` 抽象，不发明命令。Buildr Product 当前知识记录其现有 `npm run test:changed -- --base <ref> --json` 入口，Agent可在运行 broad feedback 前读取计划。预览结果只帮助识别覆盖、成本和额外风险；正式 Result 仍来自 declaration 中实际执行的 capability。

### 4. 指标保持非规范性

proposal 启动耗时、重复读取/命令、实现到 handoff 耗时和验证 wall-clock 只在 Task Retrospective 中作为跟踪、评估与优化输入。Skill 不设置硬阈值，不自动改变 gate、Result、Task status 或 next action。

### 5. 保持 capability contract 兼容

本次属于既有 provider 的内部引导优化，继续使用 `buildr.task-development@2` 与 `buildr.task-verification@3`；不修改 contract schema、binding、Application 输入输出或 repository，因此无需 migration。

## Risks / Trade-offs

- [Agent 过度把“按需读取”理解为跳过 required Skill] → 明确当前动作前仍必须读取已触发 Skill、required rule、contract 与 selected provider。
- [计划预览被误报为验证通过] → Skill 与测试同时要求 preview 不是 evidence，required formal capability 仍须实际执行。
- [效率目标变成机械追时] → 指标只进入 retrospective 参考，禁止进入 Result、gate 或自动推进。
- [通用 Skill 硬编码 Product 命令] → 通用文本只描述可选 planner；具体命令仅放入 Buildr Product 当前知识。
