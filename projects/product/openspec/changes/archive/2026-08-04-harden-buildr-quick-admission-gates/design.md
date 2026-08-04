## Context

Buildr 的统一 verification registry 已记录 `testing` 分类、目标耗时、并发类别和 profile，但没有直接表达一个 step 穿过哪些真实环境边界、如何隔离、以及是否需要重复重置。当前 Quick 的 `contract` step 实际包含开发入口子进程、Git/worktree、多个临时 Workspace 和重复 cleanup；`runtime-adapter-contract` 也反复创建并清理临时投射目录。现有 planner 只拒绝 Quick System 或目标耗时过高，无法拒绝这些分层错误。

本轮沿用现有 registry、planner、Node test 目录和 DAG，不修改 `verification.yml` 或 Task Verification。

## Goals / Non-Goals

**Goals:**

- 让每个 registry step 显式声明最小环境足迹、隔离方式和重置负担。
- 在任何 verifier 启动前自动拒绝 Component 与 Quick 的非法组合。
- 把当前 contract 中的真实环境测试迁入 Integration/affected，保留纯静态契约在 Quick。
- 用实测耗时和真实副作用解释每个保留 Quick step 的资格。

**Non-Goals:**

- 不修改 `verification.yml` schema、Task Verification declaration/Result 或 delivery policy。
- 不增加通用 scheduler、测试平台、动态环境探测或运行时分类器。
- 不按名称自动推断足迹，不建立逐 test case registry。
- 不借机重构无关测试或改变 Candidate 完整覆盖。

## Decisions

### 1. 在现有 `testing` 记录中增加两个窄事实

每个 step 的 `testing` 增加：

- `environment`: `{ footprints, isolation }`。`footprints` 是 `filesystem`、`cli`、`git`、`network`、`workspace-lifecycle` 的去重数组；`isolation` 是 `none`、`read-only`、`unique-temporary-root` 或 `shared`。
- `resetBurden`: `none`、`single-cleanup`、`repeated-cleanup` 或 `lifecycle`。

这些字段只描述准入所需事实，不复制 executor、资源或调度信息。选择闭合枚举而不是自由文本，使 planner 能确定性拒绝非法组合；不增加运行时自动探测，避免名称或短期 timing 再次成为隐式 authority。

### 2. Planner 对 Component 与 Quick 执行静态门禁

- Component 仅接受空 `footprints`、`isolation: none`、`resetBurden: none`；真实 filesystem、CLI、Git、网络或 Workspace 生命周期一律拒绝。
- Quick 拒绝 `repeated-cleanup`、`lifecycle`，并拒绝任何需要迁移、安装或完整环境生命周期的 step。
- Quick Integration 只在 `targetDurationMs` 有界、`isolation` 为 `read-only` 或 `unique-temporary-root`、`resetBurden: none` 且没有 network、Git 或 Workspace lifecycle 时允许。当前没有必须保留的 Quick Integration 例外。

保留现有 15 秒目标上限，但耗时只是一项必要条件，不再是充分条件。

### 3. 静态 contract 与真实环境 contract 使用不同 step identity

`contract` step 改为 Static，只保留读取源码、manifest、文档、Skill 和 registry declaration 的一致性检查。真实子进程、Git/worktree、临时 Workspace、候选文件变更和 cleanup 测试迁入 `test/integration`，由既有 `integration` step 在 changed/affected、Candidate 和 focus 中选择。

`testing-boundaries` static contract 继续扫描 Unit/Component，并新增 Contract 目录门禁，拒绝 child process、Git、网络和会改变临时环境的 filesystem API。这样未来新增文件不能仅靠 registry 声明绕过目录边界。

替代方案是让整个 `contract` 退出 Quick；这会丢失高价值、低成本的静态治理反馈，因此不采用。另一方案是保留混合 step 并给它标记低成本 Integration；它仍需要多次初始化和清理，不符合准入规则，因此不采用。

### 4. Runtime adapter 契约按真实重置负担退出 Quick

`runtime-adapter-contract` 穿过多个真实临时 filesystem 投射和 cleanup，继续保留 Candidate、changed/focus identity，但移除 `fast` profile。未来若把纯 descriptor/plan 静态检查拆成无重置 step，可独立申请 Quick，而不是复用当前混合入口的暂时耗时。

## Risks / Trade-offs

- [Quick 不再覆盖真实 runtime 投射与开发入口] → changed inputs、focus 和 Candidate 继续选择原 step；静态 runtime/entrypoint declaration 仍由 Quick contract/architecture 覆盖。
- [Contract 文件迁移改变直接入口的文件集合] → `npm run test:contract` 明确只保留静态契约，`npm run test:integration` 接管真实环境测试，registry contract 固化边界。
- [声明事实可能与测试实现漂移] → planner 校验闭合字段，`testing-boundaries` 对 Quick 目录做源级副作用门禁；不尝试建设通用动态追踪器。
- [一次 cleanup 的轻测试仍可能增长] → Quick 当前不保留这类 Integration；新例外必须满足无 reset burden，成本变化仍由 timing evidence 校准。
