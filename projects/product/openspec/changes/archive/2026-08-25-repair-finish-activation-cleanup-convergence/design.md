## Context

当前 repository-set Finish cleanup 先调用 Task Environment cleanup；只要 Environment 返回非 `cleaned`，函数就提前返回，不再执行 `removeIsolatedGitCarrier`。但 cleanup phase 仍被 runner 记为 `passed`，而 self-bootstrap 投影的 `cleanupCompleted()` 又把任意 passed cleanup phase 当成全部 carrier 已清理，最终产生 `carrier availability=cleaned/root=null` 与真实注册 worktree 仍存在的矛盾。

同时，Workspace repository 完成 fast-forward/push 后，Finish 立即通过 retained controller 运行只读 Doctor。若交付刚增加连续 SQLite migration，runtime schema target 已前进、canonical store 尚未有合法 writer 执行 migration，Doctor 必然返回 `workspace_store_migration_required`。已有恢复方向要求 writable Activation 先于只读 Doctor，但当前 complete-mode self-bootstrap 没有显式 migration activation 阶段。

当前事故的 migration 19 已由后续合法 structured-store mutation 应用，Doctor 已恢复 ready；物理 carrier 与原 Task worktree 仍需从同一 run 的已交付证据恢复。

## Goals / Non-Goals

**Goals:**

- 让 Finish-owned carrier cleanup、Task Environment cleanup、Activation 和 Diagnostics 四类结果真实独立。
- 让稳定投影只根据明确的物理 cleanup evidence 声明 carrier cleaned。
- 让 pending Workspace migration 在 matching self-bootstrap Activation 内由 retained writer 原子应用，再运行最终 Doctor。
- 为已完成但残留 carrier/worktree 的历史 run 提供不重交付的精确恢复。
- 用原事故形态覆盖自动 Finish、self-bootstrap、Environment cleanup 与 Doctor 的组合回归。

**Non-Goals:**

- 不放宽未知、dirty、symlink、越界或 remote 未包含 Task Contribution 时的 cleanup 门禁。
- 不让 self-bootstrap 取得通用 Finish/Environment cleanup writer 权限。
- 不重跑原任务 Candidate、Verification、Completion Review、Finish deliver 或 push。
- 不新增数据库表、后台 migration worker、事件历史或自动重试平台。

## Decisions

### 1. Carrier cleanup 不再依赖 Environment cleanup 成功

Finish 在 remote delivery 已证明后分别执行 Environment cleanup 与每个 repository 的 carrier cleanup。Environment attention 只保留 Task-owned worktree/resource；它不能跳过 Finish-owned carrier removal。每个结果分别进入 completion/maintenance，Delivery 继续保持 delivered。

选择这一方案，是因为 owner 已经分离：Environment 无权删除 carrier，Finish 也无权因 Environment attention 伪造自己的 cleanup。继续使用提前返回会永久制造残留；让 Environment 删除 carrier则扩大了错误 owner。

### 2. `cleaned` 必须绑定物理删除与读回

`removeIsolatedGitCarrier` 成功后重新确认 worktree registration 消失、目标路径不存在，并在适用时仅删除已经为空的 run container。Finish current/self-bootstrap projection保存每个 carrier 的 explicit cleanup disposition；删除 `cleanup phase=passed` 的推断 fallback。旧 run 缺少新 disposition 时，物理路径存在即投影 retained，绝不猜 cleaned。

### 3. Migration 属于 writable Activation，不属于 Doctor

Finish Delivery 在持有 matching target lease 且已证明 retained source/ref 后，通过 Product-owned closed activation helper执行一次合法 structured-store mutation，记录 before/after migration version，再运行最终只读 Doctor。若 Activation失败，Delivery仍保持delivered，保存同一run的attention；self-bootstrap runner只消费该结果执行后续sync、development entry和恢复检查。

不让 Doctor自动迁移，因为 Doctor 的只读不变量必须保持；不在 Git deliver 内直接开库，因为 retained writer/transaction/checksum/provenance 必须由 Workspace SQLite owner维护。

### 4. 历史 run 使用重建证明恢复，不修改旧 Delivery

对已 delivered 的旧 run，Product根据冻结 Task Contribution、carrier HEAD/tree、remote ancestry、task source snapshot和当前 worktree重新构建 cleanup proof。证明完整后，owner原语可删除精确 carrier；self-bootstrap以同一run的 `retry-after-foreign-clear`恢复；Environment随后消费同一delivery proof清理原Task worktree。任何identity不完整都保留现场并返回最小诊断。

## Risks / Trade-offs

- [Environment attention 时 carrier 先被删除，后续诊断少一个 checkout] → Finish Execution Record保留carrier HEAD/tree、changed paths、delivery/cleanup disposition；只有remote containment已证明才删除。
- [历史 run 缺少新字段] → 只提供基于Git objects和冻结Task Contribution可重建的兼容路径，不回填或猜测语义。
- [migration activation失败] → Delivery保持delivered，Activation返回attention和同一run恢复入口；不运行最终Doctor。
- [Finish Delivery增加Activation职责] → migration写入仍由Workspace Structured Store owner完成，Finish只在matching lease内调用封闭helper；self-bootstrap runner只编排并消费结构化结果。

## Migration Plan

1. 先交付 projection/cleanup 顺序和 regression tests，不修改现有migration内容。
2. 通过同一修复任务的 self-bootstrap 激活当前 Workspace，并确保最终Doctor ready。
3. 使用新恢复路径清理原任务 carrier、重跑同一原 run activation、再清理原 Task Environment。
4. 验证两个Task均completed、两个Environment cleaned、全部carrier/worktree absent、canonical HEAD与origin/dev一致。

## Open Questions

无。当前所有恢复对象、run identity、Git ref、数据库版本与owner边界均已确定。
