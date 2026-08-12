## Context

当前 Task 详情在一个页面内维护“概览、环境、审查、验证”四个并列页签。任务研发（Task Development）已经通过同一 compose runtime 注册唯一 Application，其 `inspect` read model 能返回 Receipt、当前适用性、候选、门禁、决定与研发交接，但 P0.5 有意没有提供公共 CLI 或 Local App surface。

本次需要增加人类可读投影，同时保持四项约束：不建立 Task Core 或聚合状态机；不复制 Review/Verification/Environment authority；不让 HTTP/Web 直接读写专业记录；不因新增模块继续横向增加一级页签。

## Goals / Non-Goals

**Goals:**

- 用四个一级视图回答“任务是什么、是否可推进、依据是什么、当前机器能否执行”
- 通过 Task Development Application 的现有 `inspect` read model 提供只读研发信息
- 保留 Review 与 Verification 的独立 reader、Result 和 Agent Action，只把展示组合到“证据”页
- 对任务详情可见文案执行中文优先规范，并保留精确协议字段作为次级技术信息
- 覆盖 missing、developing、candidate-current、handoff-current、unknown 和历史交接保留场景

**Non-Goals:**

- 不增加 Development 公共 CLI、写 API、浏览器 mutation 或直接 Receipt 编辑
- 不改变 Development Receipt、Review Result、Verification Result、Environment Receipt 或 Task Record schema
- 不增加 Board、Task Finish、Retrospective、历史浏览器、轮询、WebSocket 或新的生命周期状态
- 不重构 Local App 全站术语，只处理任务详情和本次 glossary 术语

## Decisions

1. **一级导航固定为“概览、研发、证据、环境”**。审查和验证不再各占一个一级页签，而是在“证据”页按两个连续区块展示。第一版不增加二级页签、路由或折叠状态，减少导航和响应式复杂度。备选方案“直接增加第五个研发页签”会继续按模块扩张，故不采用。
2. **研发视图只消费 Application read model**。新增 Workspace-scoped `GET /api/v1/workspaces/:workspaceId/tasks/:taskId/development`，HTTP handler 只调用 `inspectTaskDevelopment`；沿用现有 no-store、registered Workspace、Task ID 和 query 拒绝边界。既有 Review/Verification API 保持不变，浏览器打开“证据”时分别读取两个 endpoint。
3. **任务顶层状态与研发适用性分开显示**。页头继续只展示 Task Record 的 active/completed/abandoned；研发页把 `missing`、`developing`、`candidate-current`、`handoff-current`、`unknown` 映射为中文结论。页面只展示 Application 已返回的轴状态和 reason，不自行推导 Candidate、gate、decision 或 handoff currentness。
4. **unknown 保留历史事实但不伪装实时结论**。若 Receipt 存在而当前 Environment 已清理或观察失败，页面继续显示已保存的内容目标、候选、决定和最近一次研发交接，同时明确标注“历史研发交接仍被保留，但当前无法实时复核”；不得显示为失败、current 或自动 stale。
5. **默认展示宽而薄**。研发页优先显示当前结论、三个输入轴、候选代次、三个门禁、推进决定、风险数量和最新交接；长 identity 可完整保留但使用可换行的次级技术样式。页面不展示日志、diff、完整输出、完整 Result body、全部交接历史或隐藏推理。
6. **中文主称与技术标识分层**。页签、按钮、状态、说明使用纯中文；专业标题首次出现采用“中文（English Term）”；`schemaVersion`、digest、字段名、路径和代码枚举保留原值，但其标签使用中文。既有任务详情中的 `Task Record`、`current Result`、`canonical path`、`Cleanup` 等混合表达在同一修改中收敛。
7. **既有 URL 与专业 API 保持兼容**。Task 详情 URL 不变，Review/Verification endpoint 和 Agent prompt contract 不变；只调整页内入口和静态断言。若回滚，可移除 Development GET/面板并恢复原页签，不涉及数据迁移。

## Risks / Trade-offs

- [Risk] “证据”页同时读取两个 reader，单个失败可能掩盖另一份有效结果 → 两个区块保持独立 loading/diagnostic，任何一方失败不隐藏另一方。
- [Risk] 前端从 Receipt 选择“最近一次”交接可能被误读为 current → currentness 只使用 Application `applicability.handoff`；页面明确区分“最近保存”与“当前有效”。
- [Risk] Development `inspect` 在 Environment 不可用时返回 unknown，用户可能误认为历史结果丢失 → 保留 Receipt 摘要并展示“当前未实时复核”说明。
- [Risk] 文案清理扩大到全站会稀释 Change → 仅修改 Task 详情和本次直接使用的 glossary 条目，其余术语另行审视。

## Migration Plan

1. 先通过 delta 移除“首版不得增加 Local App surface”的过时要求，再增加只读 HTTP route 与系统测试，保持现有页面不变。
2. 增加研发面板，将 Review/Verification 面板包入“证据”一级视图并更新静态、浏览器测试。
3. 收敛任务详情文案、随包 `task-development` Skill 边界和 glossary/current knowledge，运行受影响验证。
4. 无持久数据迁移；回滚只需恢复静态页面和移除新增 GET route。

## Open Questions

无。
