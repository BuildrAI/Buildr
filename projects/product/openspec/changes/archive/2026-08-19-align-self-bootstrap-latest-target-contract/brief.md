# 对齐 self-bootstrap latest-target 契约

## 一句话摘要

修复 `task-closeout-orchestration` 内部的一处陈旧 Requirement，使 latest-target activation 与已经接受、实现并记录的 published linear successor 语义一致。

## 背景与问题

`broaden-self-bootstrap-successor-activation` 已经明确：满足 clean、已发布、无 merge、冻结 Finish ref 祖先关系和精确 remote/branch 一致性的普通线性后继，不依赖作者、工具或 `Buildr-Task` trailer。当前 runner、Skill、tests 与 current knowledge 都遵循该边界，但 canonical spec 中较早的 latest-target Requirement 仍要求每个 commit 具有 Buildr provenance，形成单文件内部矛盾，并在准备 `0.1.0-rc.20` 时被 OpenSpec candidate audit 阻断。

## 目标与非目标

目标是通过新的完整 MODIFIED delta 修复陈旧 Requirement，保留 frozen ref、无 merge、clean checkout、fast-forward、精确 remote 回读、target lease、Delivery Adaptation 与最多两次 same-run resume 门禁。

本次不修改 runner、Skill、tests、持久数据、公开 API、npm 发布行为或既有归档 Change，也不把普通 successor 解释为本机 Task 或继承旧验证证据。

## 受影响用户或角色

- 准备 Buildr 候选版并消费 OpenSpec candidate audit 的维护者。
- 维护 self-bootstrap closeout 契约、实现与 current knowledge 的 Agent。

## 核心流程

1. 用新的 Change 完整重述并修订 latest-target Requirement。
2. 证明普通 successor 仍受 published、clean、无 merge、祖先关系、fast-forward 和精确 remote/branch 一致性约束。
3. 严格验证并 convergence/archive，使 canonical spec 修改具有 matching Archived Change delta。
4. 通过正式 Product verification 与 Task Finish 集成到 `dev`，供 rc.20 发布 Task 消费。

## 关键变化

- 移除普通 descendant 必须带 Buildr provenance 的陈旧前置条件。
- 保留第一个场景的身份，并把条件从 Buildr-owned 交付扩展为任意符合门禁的已发布线性后继。
- 原样保留 Doctor target-race、Delivery Adaptation 与有界恢复场景。
- 不产生运行时代码、测试、schema 或依赖变化。

## 影响、风险与兼容性

主要风险是 MODIFIED Requirement 复制不完整或措辞放宽到未发布本地后继；delta 因而保留完整场景，并显式要求 frozen ref 祖先关系、无 merge、clean checkout、精确 remote/branch 和 fast-forward。该变化只恢复既有语义的一致表达，不改变运行时兼容性。

## 验收摘要

- OpenSpec strict validation 与 convergence preflight 通过。
- archive 后 canonical spec 修改具有 matching delta，candidate audit 不再因该路径阻断。
- current knowledge 和现有术语保持对齐，无新增实现或数据迁移。

## 技术 artifacts 入口

- `proposal.md`
- `design.md`
- `specs/task-closeout-orchestration/spec.md`
- `tasks.md`
