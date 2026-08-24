## Why

Buildr 自举 Task Environment 当前使用候选 CLI 对任务源码 worktree 执行完整 `sync` 来准备 runtime。完整 `sync` 不只投射 Rule/Skill，还会迁移 Structured Store、同步内置资产和 Component，因此候选验证可能在任务源码之外产生受管文件变化，并把验证副作用带到 Finish/Cleanup。门禁随后只能看到 Git dirty，无法从源头证明这些变化是否属于任务实现。

## What Changes

- 为 runtime `render` 增加显式包含产品入口 Buildr Skill 的纯投射模式；该模式不迁移 Structured Store，也不同步 workspace 源资产。
- Task Environment 准备候选 runtime 时改用纯投射模式，并继续使用候选 CLI 做 runtime check 与记录 projection identity。
- 在完整 `sync` 的首个写入前拒绝 linked candidate Product checkout 对自身源码 checkout 执行 source sync；诊断明确给出 caller、target、原因及可执行替代命令。
- 保持 retained Product source 的正常 `sync`、retained source 为 task worktree 准备 runtime、候选向无关隔离验证 Workspace 执行完整 `sync` 的既有能力。
- 增加回归测试，证明候选 runtime 准备不会改动任务源码 Git 状态，危险 sync 零写入失败，合法路径不受影响。

## Capabilities

### Modified Capabilities

- `task-environments`: 候选 Task Validation Workspace 的 runtime 准备只能执行投射，不得隐式执行 workspace source sync。
- `workspace-first-runtime-projection`: 区分纯 runtime projection 与完整 source sync，并对 linked candidate 自身源码 sync 建立窄写入门禁。

## Impact

- 影响 Buildr CLI runtime render/sync 应用层与 Task Environment 候选投射编排。
- 更新 Product OpenSpec 中 Task Environment 和 runtime projection 契约。
- 不改变 Task Domain、Application、Repository、生命周期语义、Git 远端策略或普通用户目录清理规则。
- 普通 canonical workspace 的 `buildr sync` 行为保持不变；本变更只阻止可证明会把候选验证副作用写回同一 linked source checkout 的完整 sync。
