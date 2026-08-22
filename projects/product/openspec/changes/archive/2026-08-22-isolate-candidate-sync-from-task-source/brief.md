# 隔离候选 Sync 与 Task 源码

## 一句话摘要

Task Environment 只用候选 Buildr 做 runtime 投射，不再对任务源码 worktree 执行完整 `sync`；完整 source sync 仍可在 canonical Workspace 或独立验证 Workspace 正常使用。

## 背景与问题

自举 Task 的 runtime 准备原本调用候选 CLI `sync`。该命令除了投射 Rule/Skill，还会迁移 Structured Store、同步 package builtin 与 Component 源资产，可能把与任务实现无关的变化写回 task checkout，并在 Finish/Cleanup 时表现为无法证明的 Git dirty。

## 目标与非目标

- 目标：从写入源头分离 runtime projection 与 Workspace source sync；危险组合零写入失败并给出安全替代命令。
- 非目标：不按 `.buildr`、OpenSpec 或其他目录白名单放宽 Cleanup，不改变 Task 生命周期、Git 策略或普通用户代码规则。

## 受影响角色

主要影响在 Buildr 自举 Workspace 中准备和验证正式 Task 的 Agent/维护者。普通 Workspace 用户继续使用现有 `buildr sync`。

## 核心流程

Task Environment 通过候选 CLI 执行 `render <adapter> --product-skill --target <task-root>`，随后执行候选 `runtime check` 并保存 projection identity。若 linked candidate 对自身源码 checkout 执行完整 `sync`，Buildr 在初始化、plan、migration 与源资产写入前拒绝；需要完整 sync 验证时改用独立验证 Workspace。

## 关键变化

- `render` 新增 `--product-skill`，只扩展投射内容，不获得 source/store mutation。
- Task Environment 候选准备从 `sync` 切换为纯 render。
- sync 写入边界新增 linked candidate/self-checkout 窄门禁与可执行诊断。
- 回归测试覆盖零写入、无 Git 污染、独立验证 Workspace 与 retained canonical sync 兼容性。

## 影响、风险与兼容性

普通 retained `sync`、retained source 为 task worktree 投射 runtime、candidate 对无关隔离 Workspace 执行完整 sync 均保持可用。依赖候选 worktree 内完整 sync 的脚本需要改用纯 render 或独立验证 Workspace；这一失败是具体 mutation 的安全门禁，不是 Task/Environment 通用许可门禁。

## 验收摘要

- Task Environment 候选准备不执行 source sync，task checkout 不新增污染文件。
- linked candidate/self-checkout 完整 sync 在首个 mutation 前失败并返回 `render --product-skill` 指引。
- 相关系统、集成、契约测试与 Product 快速验证通过。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Task Environment delta](specs/task-environments/spec.md)
- [Runtime projection delta](specs/workspace-first-runtime-projection/spec.md)
- [Tasks](tasks.md)
