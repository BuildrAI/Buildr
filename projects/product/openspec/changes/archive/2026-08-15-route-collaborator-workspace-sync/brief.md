# 协作者更新后的工作空间同步路由

## 一句话摘要

让 Agent 把协作者推送导致的 canonical Workspace 前进识别为普通 Workspace update，并在 Doctor 指向 managed projection stale 时执行 workspace sync，而不是误用本地 Formal Finish 的 self-bootstrap activation。

## 背景与问题

现有 Git、Doctor、workspace sync 与 self-bootstrap 已各自拥有明确 authority，但缺少协作者更新场景的排他路由。实际操作中，本地没有协作者的 Task 是正常状态，却可能被错误解释为 Task/Finish 异常并触发不适用的恢复建议。

## 目标与非目标

- 目标：建立 Git tree transition、Doctor findings、matching Finish Result 三者之间的确定性路由。
- 目标：保持 workspace sync 的用户授权和最终 Doctor 证据。
- 非目标：不新增后台监听、持久队列、提交作者 ownership 推断或新 CLI 状态机。

## 受影响角色

主要影响在 Buildr workspace 中处理协作者更新、创建新任务或维护 runtime projection 的 Agent 和开发者。

## 核心流程

Agent 通过 selected Git provider 更新 canonical checkout；若 tree 变化，运行当前 Agent Doctor。当前会话不存在匹配 Formal Finish Result 时，状态只能归类为普通 Workspace update。Doctor 仅报告 managed projection stale 时，Buildr Skill 在已有或新取得的授权下执行 `buildr sync` 并消费最终 Doctor；其他 blocker 仍交给对应 authority。只有匹配 Finish Result/run 才可进入 self-bootstrap runner。

## 关键变化

- task-triage 在创建前 Git 基线收敛后显式执行上述分类。
- Buildr runtime Skill 明确协作者 Workspace update 的 sync 路由和 authority 排除项。
- self-bootstrap Skill 明确无 matching Finish Result 为不适用，而不是异常恢复入口。
- 契约测试覆盖普通 update 与 Formal Finish 两条排他路径。

## 影响、风险与兼容性

不改变 CLI、数据库或现有 Result schema。主要风险是 Doctor 有混合 blocker 时被过度简化；新路由要求仅在 managed projection stale 是适用修复时执行 sync，其他问题保持 fail closed。

## 验收摘要

需要证明协作者提交加无 matching Finish 时只推荐 workspace sync，matching Finish 时 self-bootstrap 仍适用，非 sync Doctor blocker 不会被一次 sync 掩盖，sync 不创建 Task/Finish authority。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Agent Task Workflows delta](specs/agent-task-workflows/spec.md)
- [Tasks](tasks.md)
