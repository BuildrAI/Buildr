# 正式 Verification 就绪预检

## 一句话摘要

在 Task Development 交给 Formal Verification 前阻止明确尚未稳定的目标，并用一次只读 current knowledge 检查补齐专业边界，同时不影响开发期测试和通用 transient verification。

## 背景与问题

现有 workflow 已规定 Change convergence/archive、current knowledge 与最终内容稳定先于 Content Target，但 Application 仍允许在关联 Change 为 `pending` 时调用 `observe`。Candidate freeze 最终会阻止不完整事实继续交付，昂贵 Formal Verification 却可能已经对随后改变的 target 白跑。

## 目标与非目标

目标是让 `observe` 拒绝明确 pending Change，并在 Task Entry 中投影 response-only readiness：已知 blocker 先处理，current knowledge 未即时确认时路由其 owner 做只读 `inspect`，aligned/not-applicable 后直接进入原 Task Verification。

本 Change 不修改通用 `verification run`、开发期 focused/affected 测试、Task 外 transient verification、Candidate CI 或 Task Verification Result；不新增 SQLite/Receipt authority，也不让 Task Development 解析 OpenSpec/current knowledge 正文。

## 受影响角色

- Agent：在昂贵正式验证前得到动作就近的最小就绪摘要，不再只靠记忆拼接 Change、Content Target 与 knowledge 顺序。
- Buildr 维护者：Application 的 stable target 写入边界与既有 contract 一致，旧过早 Receipt 也能以只读 blocker 暴露。

## 核心流程

1. 开发期 focused/affected 测试继续直接运行，不消费 readiness。
2. Change checklist、实现、current knowledge 与 deterministic convergence/archive 完成。
3. `observe`只接受空 Change、`not-applicable`或已证明 archived 的`converged` disposition，形成 stable Content Target。
4. policy current且Formal Verification缺失时，Task Entry先推荐 current knowledge只读`inspect`。
5. aligned/not-applicable在同一tree上直接进入Task Verification；unresolved先收敛内容并重新观察target。

## 关键变化

- `observe`增加pending Change零写入诊断。
- Development compact/Task Entry增加response-only `formalVerificationReadiness`。
- typed next增加action-local current knowledge inspect，不持久化其Result。
- 明确Formal Verification交接与开发反馈、通用验证、Candidate CI隔离。

## 影响、风险与兼容性

无数据库迁移。旧 Receipt 若曾在 pending Change 上形成target，只显示blocked并要求重新稳定；不会被静默改写。恢复上下文后可能重复一次轻量knowledge inspect，这是避免新authority的有意取舍。推荐动作不是通用executor硬门禁，合法替代仍由实际owner contract判断。

## 验收摘要

- pending Change不能再由`observe`形成stable Content Target。
- 空 Change、Workspace-only和not-applicable路径继续可用。
- Task Entry在昂贵验证前返回明确readiness与owner next。
- focused/affected测试、`verification run`与Candidate CI实现和调用成本不变。
- Receipt、Task Verification Result与SQLite schema无新增状态。

## 技术artifacts

- `proposal.md`
- `design.md`
- `specs/task-development/spec.md`
- `specs/agent-task-workflows/spec.md`
- `tasks.md`
