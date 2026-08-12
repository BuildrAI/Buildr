# 迁移 Skill 投射所有权回执

## 一句话摘要

把 Buildr 为各 Agent Skill 投射保存的所有权回执从 Agent runtime 根迁移到名称清晰、destination 隔离的 `.buildr/agent-runtime/` 控制状态目录。

## 背景与问题

Buildr 依靠投射所有权回执证明 runtime Skill 的资产身份、来源、文件完整性、更新权和清理权。当前回执位于 `.agents/buildr/skill-projection-receipts/` 等 adapter runtime 根中，既不是 Agent 要消费的 Skill，又无法从路径直接看出它属于 Buildr、哪个 Agent、哪个 destination 和哪类治理证据。

## 目标与非目标

目标是把 workspace 与 user 回执分别收敛到 `.buildr/agent-runtime/workspace|user/<adapter>/skill-projection-ownership-receipts/`，保持现有 ownership、冲突和安全清理行为，并自动迁移可证明的旧回执。

本次不移动 Agent 实际消费的 Skills，不引入数据库或新回执 schema，也不顺带迁移 install plans、satisfaction evidence、Rules bridge 或其他 runtime metadata。

## 受影响用户或角色

- 使用 Buildr sync/render 管理 Agent Skills 的 Workspace 用户。
- 维护 runtime adapter、Doctor、Component 和 package lifecycle 的 Buildr 开发者。
- 显式把 Skill 投射到用户级 runtime 的高级用户。

## 核心流程

1. Buildr 根据 source Workspace、destination、adapter 和 runtime path 解析 canonical receipt。
2. 若只存在有效旧回执，Buildr 在 mutation preflight 核对 schema、identity 和 runtime inventory。
3. 受管 transaction 同时写入 canonical 回执、应用 Skill 变更并删除旧回执；任一冲突或失败保留原现场。
4. Doctor 从 canonical 路径发现 runtime；legacy-only 状态只产生迁移诊断，不成为长期 authority。

## 关键变化

- Workspace：`<workspace>/.buildr/agent-runtime/workspace/<adapter>/skill-projection-ownership-receipts/`。
- User：`<user-home>/.buildr/agent-runtime/user/<adapter>/skill-projection-ownership-receipts/`。
- 新增 `/.buildr/agent-runtime/` Git ignore 基线。
- 清退旧 `<runtime-root>/buildr/skill-projection-receipts/<adapter>/`，不长期双读。

## 影响、风险与兼容性

新版本可自动迁移有效旧回执；新旧回执不一致时 fail closed。旧 CLI 不认识 canonical 路径，会把现有 runtime Skill 视为 external 并停止自动管理，因此路径变化按 breaking compatibility 说明，但不会静默覆盖或删除用户文件。

## 验收摘要

- 七个 adapter 的 workspace/user canonical 路径正确且 home-as-workspace 不冲突。
- legacy-only 可原子迁移；dual-equivalent 可清退旧回执；dual-conflict 与 runtime drift 零写入阻塞。
- 重复 render 幂等，stale cleanup、Component/builtin lifecycle 和 Doctor discovery 保持正确。
- 自举 Workspace sync 后只保留 canonical Codex ownership receipts，Doctor healthy。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta specs](specs/)
- [Tasks](tasks.md)
