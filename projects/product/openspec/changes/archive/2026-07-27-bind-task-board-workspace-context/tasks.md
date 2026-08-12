## 1. 确定性绑定

- [x] 1.1 更新 task-board Skill 和 maintenance contract，直接消费 `worktree context.workspaceRoot` 并删除分支式解析。
- [x] 1.2 增加 canonical delta specs 与产品说明，明确 context invalid 时 fail closed。

## 2. 回归与投射

- [x] 2.1 增加 contract tests，要求唯一命令/字段并禁止 receipt、扫描和显式 identity fallback。
- [x] 2.2 同步 Workspace/runtime 投射并验证 source/package/runtime 一致。

## 3. 收敛与验证

- [x] 3.1 完成 Brief/current knowledge impact evidence、OpenSpec guards 和 strict validation。
- [ ] 3.2 运行最终受影响验证、归档、集成、push、retained runtime doctor 与安全清理。
