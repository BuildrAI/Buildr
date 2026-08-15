## Context

Buildr 的 Fast 已稳定在秒级，changed/full 也会在重型 executor 前运行 admission；当前主要性能缺口不再是缺少入口，而是重型 owner 粒度仍大于日常实现风险。

拆分前代表路径的 affected plan 如下。表中的重型数量排除 Fast 与 admission，调度成本是 registry 的静态估计，用来比较编排变化，不等同于实际墙钟：

| 场景 | 路径 | 重型 owner | 调度成本 |
| --- | --- | ---: | ---: |
| 声明诊断 | `src/application/doctor/project-verification-diagnostics.mjs` | 6 | 79s |
| OpenSpec | `src/application/openspec/projected-validator.mjs` | 6 | 125s |
| Runtime Skill | `src/infrastructure/runtime/skills/render-plan.mjs` | 13 | 174s |
| Workspace SQLite | `src/infrastructure/sqlite/workspace-sqlite.mjs` | 4 | 65s |
| Task Environment | `src/application/task-environment/task-environment-application.mjs` | 5 | 275s |
| Worktree | `src/application/worktree/worktree-application.mjs` | 4 | 85s |
| Task Finish | `src/application/task-finish/task-finish-run.mjs` | 4 | 75s |
| 公共 JSON | `src/application/json-contracts.mjs` | 5 | 63s |

任务二的正式验证总墙钟 238.628 秒，53-owner plan 全绿但有 13 条预算 warning。general Integration 的开发期独立样本为 25.943 秒，其中 self-bootstrap closeout 约 24.9 秒、Task Environment 文件约 8.3～9.8 秒；System evidence 中 Worktree 约 34.6 秒、Workspace Registry 约 31.4 秒、Task Finish 产品 Journey 约 50.6 秒、CLI Journey 约 9.9 秒。这些数据证明存在真实可独立选择的领域长尾，但本任务首先优化日常 affected 精度，不以 warning 数量作为目标函数。

## Goals / Non-Goals

**Goals:**

- 普通领域修改只启动直接相关的重型 owner，Fast 与 admission 继续先失败。
- Integration/System 拆分前后的 Candidate 行为文件并集相同，每个文件恰好一个 primary owner、同一 plan 最多执行一次。
- 保留已有稳定 ID 给语义连续的主领域，新 owner 可独立 focus、计时和诊断。
- 用代表路径的 owner 集合、静态调度成本和同树 focused timing 证明开发反馈改善。
- 调查任务二全部 13 条 warning，并对不可继续拆分的完整生命周期 owner独立校准预算。

**Non-Goals:**

- 不删除测试、不降低 Scenario、不用条件跳过或缓存旧结果换取速度。
- 不要求 Candidate wall time 与 owner 数量同比下降；Candidate 仍承担完整覆盖，允许小量进程启动开销。
- 不修改 `verification.yml`、Browser/Release capability、正式 Result schema 或 Candidate CI 平台拓扑。
- 不把预算 warning 变成正确性门禁，也不保证任意共享 runner 负载下绝对零 warning。

## Decisions

### 1. Integration 使用统一 primary slice registry表达领域边界

保留 `integration` 稳定 ID，收窄为少量跨领域技术边界。统一 `INTEGRATION_PRIMARY_SLICES` 在既有 Task read model、coordination、execution record、Development 与 Finish 基础上新增或补齐：

- `integration-declarations`：Project Environment/Verification diagnostics 与 package verification declaration；
- `integration-openspec`：Change 与 OpenSpec convergence/projected validation；
- `integration-verification`：verification entrypoint、planner、evidence、runtime 与 resource coordination；
- `integration-runtime`：runtime capability、Skill projection、Local App runtime、preview、Web dist 与 Workspace Node；
- `integration-release`：open-source payload 与 installation identity/registry；
- `integration-data-store`：Workspace SQLite authority 与 migration behavior；
- `integration-task-environment`：Preparation Plan、controller handoff、repository 与 diagnostics；
- `integration-self-bootstrap`：唯一 self-bootstrap closeout lifecycle；
- `integration-task-finish-delivery`：remote delivery、retained activation/cleanup 与 contribution。

既有 `integration-task-development` 吸收 driver、repository、Review/Verification repository 文件；既有 `integration-task-finish` 保留 bootstrap、run、SQLite、entry readiness 与 diagnostics core。general exclusions 只由 slice 文件并集生成，不维护第二份文件清单。

多个实现 owner 可能共同选择多个不同事实 owner，但同一测试文件不能出现在两个 primary slice；测试路径自身只选择其 primary owner。

### 2. System 按用户 Journey 与公共契约拆分

Verification System：

- `system-verification-admission` 保留 changed-path/run CLI 的廉价 planner canary；
- `system-verification-contracts` 保留 scheduler/resource/timing/workspace verification 编排事实；
- 新增 `system-public-json-contracts` 持有公共 JSON 闭合契约；
- 新增 `system-openspec-contract-audit` 持有 OpenSpec public audit。

Workspace/Task System：

- `system-workspace-lifecycle` 保留 Project、Service、Workspace catalog 与 package capability 生命周期；
- 新增 `system-task-lifecycle` 持有 Task Record、Change resolver、Review、Verification 与 generic Development Journey；
- 新增 `system-worktree-lifecycle` 持有真实 Git Worktree/Task Environment create/cleanup Journey；
- `system-task-finish` 保留完整产品交付 Journey；新增 `system-task-finish-cli` 持有公共 CLI Journey。

所有 suite 继续从单一 `SYSTEM_SUITES` registry 派生 executor、inner concurrency、timing reporter 和完整文件 owner validation。Workspace/Task 重型 owner保留 `workspace-saturating`，两个 Finish owner保留 `task-lifecycle-heavy`，避免拆分后无证据并发扩张。

### 3. 性能验收以 affected 精度为主、focused timing 为辅

实现前后使用同一组代表路径比较：

- 直接领域 owner必须出现；已知无关 sibling owner必须消失；
- 文件 union、Candidate profile 与 CI shard coverage必须通过静态契约；
- 新增或显著改变的重型 owner在同一 tree至少两轮 focused 成功采样，记录中位数与波动；
- 日常开发的成功标准是重型 owner边界和预计成本收窄，不把一次机器墙钟当永久 SLA。

若一个拆分会重复昂贵 seed、完整 lifecycle 或不可变准备，则保留单一 owner。例如 runtime adapter parity、concurrent Task acceptance 与 release tarball smoke均不按内部 case机械拆分。

### 4. 13 条 warning 是校准输入，不是设计驱动

`integration`、`integration-task-finish`、`system-workspace-lifecycle`、`system-task-finish` 通过领域拆分处置。coordination、execution records、acceptance、capability/commands CLI、package workspace、runtime parity、CLI parity 与 release smoke保持其闭合事实 owner，结合任务二 full-load 样本和本任务 focused 样本设置独立预算与 `schedulingCostMs`。预算仍只产生 `within|over` observation。

### 5. Candidate/CI 保持完整拓扑

本地 Candidate profile自动包含新增 owner。Candidate CI 的 `core-macos` 接收新增 Integration 与 Verification System owner；`workspace-lifecycle-windows` 接收 Task/Worktree System owner；`task-workflow-windows` 接收 Task Finish CLI owner。现有 runner、phase、单一 tarball、artifact dependency、Windows 平台 owner 与 `Candidate gate` 保持不变。

## Risks / Trade-offs

- [owner 增多造成 Candidate 进程启动开销] → 只按可独立 affected 的稳定领域拆分；同一 registry保护 union，最终一次正式验证观察整体回退。
- [输入映射过窄导致漏选] → 生产源码 direct-owner admission guard，加上代表 source/test path planner contract。
- [输入共享导致 affected 仍选多个 owner] → 只要求真实不同事实 owner；测试文件 primary ownership严格唯一，文档解释共享入口的必要 fan-out。
- [预算余量过宽隐藏回归] → 保存任务二 full-load、同树 focused 两轮与最终正式 timing；不统一乘系数。
- [Windows shard 负载变化] → 文件集合不增加，只改变 owner投影；继续由 registry coverage contract检查。

## Migration Plan

1. 固化拆分前代表 changed-plan 基线，更新 registry metadata、Integration/System owner集合与 union contract。
2. 运行 Fast、verification admission canary和代表 planner tests，在启动重型采样前修复 owner/admission错误。
3. 更新 Candidate/CI projection，对新增重型 owner做同 tree focused 两轮采样并校准预算。
4. 更新验证所有权文档与当前知识，完成 strict、preflight和planning identity readiness。
5. Change 收敛归档并冻结 Content Target 后，只执行一次正式 `product.delivery`。

## Open Questions

无。最终正式验证若仍有单次预算 warning，按 owner timing判断结构问题或环境波动；不以全局抬预算自动消除。
