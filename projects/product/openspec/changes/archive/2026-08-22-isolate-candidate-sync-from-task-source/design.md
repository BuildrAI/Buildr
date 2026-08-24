## Context

Task Environment 当前通过候选 Buildr CLI 在 task checkout 根执行 `sync`，目的是取得包含候选产品 Skill 的 runtime projection。`sync` 的真实语义却包含 Workspace Structured Store migration、Project registry migration、package builtin/Component source sync、runtime render 与 Doctor。于是一个 projection 准备动作拥有了修改任务源码 checkout 中非任务目标资产的能力。

现有 runtime guard 已能识别 linked Product checkout，并阻止它写 retained checkout、peer worktree 或验证根外的 user runtime；缺口是它把候选对“自身 checkout”的 `render` 与完整 `sync` 视为同一种合法动作。Cleanup 看到的 dirty 只是下游结果，无法可靠恢复写入发生前的意图。

## Goals / Non-Goals

**Goals:**

- 让 Task Environment 使用候选代码完成 Rule、workspace Skill 与产品入口 Buildr Skill 的纯 runtime 投射，不触发 source sync 或 store migration。
- 在完整 `sync` 首个 mutation 之前阻止 linked candidate 修改自身源码 checkout，并提供直接可执行的安全替代路径。
- 保持 retained canonical sync、retained-to-task projection 与 candidate-to-isolated-workspace sync 的兼容性。
- 用 Git 状态和 mutation spy 回归测试证明零污染、零写入。

**Non-Goals:**

- 不按 `.buildr/*`、OpenSpec 或其他路径名单放宽 Cleanup Proof。
- 不改变 Task 生命周期、Environment ownership、Finish carrier、Git 远端或普通用户代码清理规则。
- 不要求普通命令先存在 Task/Environment Receipt，也不把 Buildr 变成所有 workspace 操作的权限入口。

## Decisions

### 1. 扩展纯 `render`，不裁剪 `sync`

`render` 接受显式 `--product-skill`，把既有 `renderRuntime(..., { productSkill: true })` 能力暴露给候选 CLI。该命令只组装并 reconcile runtime plan，不调用 migration、package builtin/Component sync 或 Doctor。

选择这一方案，是因为 Task Environment 的需求本质是 projection；给 `sync` 增加 `--projection-only` 会让命令名与行为冲突，也容易在未来误把新的 source mutation 带回验证路径。

### 2. Task Environment 候选准备调用纯投射后再 check

候选 controller 运行 `render <adapter> --product-skill --target <validationRoot>`，成功后继续运行候选 `runtime check`，Environment Receipt 只保存 projection identity/ready evidence。retained controller 路径继续直接调用应用层 `renderRuntime`。

### 3. 门禁绑定 mutation 类型，而非 Task 生命周期

新增 sync 专用 preflight：当 Product source 是 linked worktree，且 `sync` target 与 source checkout 相同时，在 workspace 初始化检查、plan 计算、store migration 与 source write 之前失败。错误包含 source、target、拒绝原因，以及 `render ... --product-skill` 和“使用独立验证 Workspace”两条下一步。

该门禁不读取 Task Record，也不要求正式 Environment；它只拒绝从 Git identity 可证明的危险 mutation。候选向无关隔离 Workspace 执行完整 sync 继续允许，普通 retained checkout 对自身执行 sync 继续允许。

### 4. Cleanup 不接纳路径白名单

本变更通过阻止错误写入来避免 dirty，而不把管理文件自动判为可丢弃。这样新增/修改 Skill 后在 task worktree 测试不会被 Cleanup 静默吞掉；若仍有真实未提交变化，现有 Cleanup Proof 继续阻断。

## Risks / Trade-offs

- [已有脚本依赖候选 worktree 内完整 `sync`] → 现在会收到明确错误；脚本应改用纯 render，或把完整 sync 的 target 改为独立临时 Workspace。
- [`--product-skill` 扩大 render 的公开参数面] → 参数只选择投射内容，不增加 source/store mutation，且通过 CLI 与系统测试固定语义。
- [纯 render 不运行 Doctor] → Task Environment 随后仍执行候选 `runtime check` 并绑定 projection identity；完整 workspace 健康检查仍属于 retained activation/sync。

## Migration Plan

1. 先交付 render 参数与 sync 写入前 guard。
2. 将 Task Environment 候选投射切换到 render 参数。
3. 运行 runtime authority、Task Environment controller handoff 与 package/CLI 回归测试。
4. 交付后由自举 retained runner 执行正式 sync、入口检查与 Doctor。

回滚时可整体回退本变更；不涉及 schema/data migration。

## Open Questions

无。
