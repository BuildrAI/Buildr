## Context

`buildr openspec converge` 已经是唯一 canonical writer：它先写 Convergence Receipt，再完成条件式应用、写后 strict confirmation 和 `archive --skip-specs`。当前 `buildr openspec audit` 只是读取 Receipt 并把实际文件分类为 before、expected 或 unknown，但名称和规范把它扩张成归档后的长期审计。与此同时，Task Content Target 和 Delivery Carrier 都排除 `.buildr` 控制材料，导致“归档后长期保留 Receipt”无法进入正常 Git 交付。

本任务不修补这一矛盾为新的持久化机制，而是收窄语义：Receipt 只保护尚未终结的 convergence transaction；正常终态由 Archived Change、Canonical Specs、Git 和 Formal Finish 事实表达。

## Goals / Non-Goals

**Goals:**

- 统一 `OpenSpec Convergence`、`OpenSpec Converge` 与 `OpenSpec Convergence Inspect` 名称。
- 让 Inspect 只读判断当前事务是否未应用、已应用待完成或状态未知。
- 让正常 Converge 在归档并释放事务 Receipt 后才返回 `passed`。
- 让“未开始”和“已经终结”在 Inspect 中返回 `not-applicable`，不伪报恢复失败。
- 让产品候选从归档 Change delta 与 canonical facts证明规范变化，不依赖 tracked Receipt。
- 保持历史 Task、Archived Change 和历史 Receipt 原样可读，不做 backfill 或批量清理。

**Non-Goals:**

- 不提供归档后的长期文件漂移审计、合规审计或 forensic history。
- 不新增 SQLite 表、Result、event/history/audit store、lifecycle cache 或后台清理器。
- 不改变 OpenSpec delta 格式、canonical spec authority、Task Finish Result 或 Task Environment schema。
- 不迁移或删除任何历史 Archived Change 中已有的旧 Receipt。

## Decisions

### 1. 统一公开名称并移除误导入口

公开写操作继续使用 `buildr openspec converge`；只读恢复检查改为 `buildr openspec convergence inspect`，公共 JSON schema 改为 `buildr.openspec-convergence-inspect/v1`。`buildr openspec audit` 从 command catalog 移除并返回标准 unknown-command，不保留第二个可执行别名。

选择三段命令是为了让 `convergence` 成为能力域、`inspect` 成为只读动作，同时不破坏已稳定的 `converge` 写入口。保留 `audit` alias 会继续维持错误语义和双入口，因此不采用。

### 2. Receipt 是事务期恢复材料

Receipt 仍在首次 canonical mutation 前写入 Change 的 `.buildr/convergence-receipt.json`，保存完整 before/expected 与 identity，保证中断后能够基于文件事实恢复。Archive 成功后，Converge 在返回 `passed` 前释放本次事务 Receipt；释放失败返回可重试的 blocked 结果，但不回滚已经确认的 canonical 或 archive。

如果进程在 archive 成功后、Receipt 释放前退出，Archived Change 已经是终态事实；再次 Converge 只完成幂等终结。历史归档目录里已有 Receipt 不做迁移或批量删除。

### 3. Inspect 只检查当前恢复现场

Inspect 只在 active Change 存在有效 Receipt 时比较 before/expected/actual：

- 全部 before：`passed + planned-not-applied`；调用者重新运行 Converge。
- 全部 expected：`passed + applied-and-matched`；调用者重新运行 Converge完成确认/归档。
- mixed/unknown 或 Receipt 无效：`recovery-unprovable`，停止自动写入并人工核对。
- active Change 无 Receipt：`not-applicable + convergence-not-started`。
- Archived Change：`not-applicable + convergence-terminal`，无论历史目录是否仍有 Receipt。

Inspect 不写 Receipt、canonical、archive 或任何状态；它不是 Planning、Verification、Completion 或 Finish gate。

### 4. 正常长期证明复用现有 authority

归档后的长期事实由以下既有 authority 组合：

- Archived Change 保存 proposal、design、delta specs、tasks 和 Brief；
- Canonical Specs 保存当前产品契约；
- Git 保存交付内容与历史；
- Task Development/Finish 保存 Task 的专业完成事实。

产品候选验证改为检查 candidate tree 中的 canonical Requirement 变化能够关联到同一 candidate 的 Archived Change delta，并继续执行 OpenSpec strict validation。它不得要求 tracked convergence Receipt，也不得生成替代 Receipt。

### 5. Skills 只在异常恢复时路由 Inspect

OpenSpec Contract Guard 和 workflow contributions 在 `converge` 返回 `recovery-unprovable` 或执行中断且现场仍存在时，才建议 `convergence inspect`。`converge` 返回 `passed` 后直接进入 Development 后续阶段；Formal Task Finish 和 Environment cleanup 不调用 Inspect，清理后也不追索 Receipt。

## Risks / Trade-offs

- [不再提供归档后的 Receipt 文件漂移比较] → 明确这是非目标；正常历史读取使用 Archived Change、Canonical Specs 与 Git。如未来确有合规审计需求，必须独立设计而不能复用事务 Receipt。
- [Archive 成功但 Receipt 释放失败] → 返回精确 blocked 结果；canonical 与 archive 保持不变，重试只完成终结/清理。
- [候选审计从 Receipt 转向 Archived Change delta 后实现更复杂] → 复用现有 OpenSpec parser/planner，以公开 delta 语义验证关联，不复制同步算法。
- [`openspec audit` 是 breaking removal] → command catalog、帮助、JSON registry、Skills、docs 和 tests 同步更新；unknown-command suggestions 指向唯一新入口。
- [历史归档目录仍包含旧 Receipt] → forward-compatible 保留，不读取为新的正常流程 authority，也不为本任务编写清理 migration。

## Migration Plan

1. 先新增 Convergence Inspect Application/CLI/JSON，并让新流程返回 `not-applicable`。
2. 更新 Converge 的成功终结和 Receipt release；补 archive 后中断/重试测试。
3. 将候选契约审计切换到 Archived Change delta；确认 canonical 漂移仍会被拒绝。
4. 更新受管 Skills、Component contributions、CLI/public JSON registries和 current knowledge。
5. 删除 `openspec audit` descriptor/handler/schema key，运行 package/runtime parity 与完整 Candidate。
6. 不修改历史归档资产；回滚只需恢复代码、规范和受管资产，不涉及数据 migration。

## Open Questions

无。
