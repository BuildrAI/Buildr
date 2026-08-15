## Context

RC.12 的 dev→main Candidate Verify 墙钟耗时为 7 分 55 秒，关键路径是单个 `workspace-windows` job。该 shard 内部使用资源受限 profile，`workspace-saturating` 容量为一，因此七个 Workspace/Task owner 串行执行。与此同时，preflight 与 artifact 分属两个 macOS job，所有 Windows shard 都等待并下载 artifact，即使其中两个 shard 不消费它。

正式 release Task 还暴露出另一层重复：`product.delivery` 因 package metadata 变化扩成 full-scope，而 required `product.release-artifact-set` 又独立执行 release group，导致五个 registry step 在两个并行 command capability 中重复。Task Verification 是通用 opaque command runner，不应理解 Buildr Product 私有 registry，因此去重必须由 Project capability ownership和统一 registry 选择边界解决。

最后，已退役测试目录仍被 `integration-candidate-recovery` npm glob 引用；Node 在该 CI shell 上以零测试退出成功，使 Candidate aggregate 接受了没有证据的绿色 step。

## Goals / Non-Goals

**Goals:**

- 在任何 registry `node-test` 或受管测试 glob 解析为空时，于启动测试前 fail closed。
- 让一个 primary owner 只在同一正式验证 execution 中执行一次，同时保留独立 release artifact 诊断入口。
- 仅版本元数据变化走 affected；依赖图、脚本、验证拓扑或无法证明的 package metadata 变化继续 full-scope。
- 缩短 Candidate CI 的串行前置和 Windows Workspace/Task 关键路径，同时保持原有 step、平台和 Host Node 证明集合。
- 保持稳定 `Candidate gate` job name、closed evidence aggregate、source/artifact/registry identity 与 failure propagation。

**Non-Goals:**

- 不减少 macOS/Windows release smoke、Launcher 或 Host Node tuple。
- 不改变 Publish workflow 的 Environment 审批、tag artifact rebuild 或 Registry readback。
- 不让通用 Task Verification Application 解析 Product 私有 test plan，也不新增 capability declaration schema。
- 不承诺单次 CI 耗时阈值；性能验收继续使用同 tree 多轮中位数和波动范围。

## Decisions

### 1. 空测试在 Product verification adapter 边界失败

新增一个只使用 Node 内置能力的测试文件解析器，显式展开受管 glob、排序并拒绝空集合；package script 的候选集成测试和 registry `node-test` executor 复用同一语义。`integration-candidate-recovery` 不恢复已经被其他 primary owners 持有的重复矩阵，而是从 registry、Candidate shard 和 package script 正式退役；契约测试证明剩余 recovery owner 仍覆盖 builtin restore、rollback、managed integrity 与公开 lifecycle。

选择该方案而不是为零文件保留占位测试，是因为占位测试只会把 registry 完整性问题重新伪装成绿色。选择在 adapter 边界检查而不是依赖 Node CLI 退出码，是为了让 macOS、Windows 和本地 shell 语义一致。

### 2. 用 primary capability ownership消除正式重复

`product.delivery` 保持唯一 required delivery capability，并继续让 changed planner选择所有 affected owner。`product.release-artifact-set` 保留为 optional、可独立选择的 release artifact 诊断能力；它不再与普通正式交付自动并行执行。该声明变化与既有 current knowledge 中“正式交付只有一个 required product.delivery”一致。

不在通用 `verification run` 中合并命令或解析 stdout。capability invocation 是 Project 声明的 opaque command，通用 runner无法安全判断两个命令是否覆盖相同 step；引入 Project-specific merge 会破坏 capability contract 边界。

### 3. package metadata 使用保守语义分类

当 `test:changed --base <ref>` 同时观察到当前与 base JSON 时，仅允许以下差异免于 full-scope：`package.json.version`、`package-lock.json.version` 和 `package-lock.json.packages[""].version`。删除这些字段后结构必须深度相等；解析失败、缺少 base、显式 paths-only 调用或任何其他差异均保持 full-scope。

这比移除 `package.json`/`package-lock.json` full owner 更安全：依赖、scripts、engines、bundle、lockfile dependency graph 和验证工具变化仍然触发完整回归。

### 4. 一个 bootstrap job 顺序产生两份 evidence

GitHub `candidate-bootstrap` 在同一 macOS checkout、Node、`npm ci` 和 Workspace Node 上先运行 `preflight-macos`，成功后运行 `artifact-macos` 并上传不可变 package 与两份独立 evidence。任何 preflight 失败都会阻止 artifact 和下游 shard。

registry 仍保留两个稳定 shard identities；合并的是 runner setup，不合并 evidence owner。

### 5. Windows 按资源压力拆成两个非 artifact shard

原 `workspace-windows` 拆为：

- `workspace-lifecycle-windows`：`system-workspace-lifecycle`、`workspace-lifecycle`、`openspec-convergence-recovery`；
- `task-workflow-windows`：`integration-task-development`、`system-task-finish`、`concurrent-task-acceptance`。

两者运行在独立临时 GitHub runner，每个 runner 内仍使用 `ci-workspace-limited` 和容量一，不提高单机资源并发。`runtime-windows` 是 Windows matrix 中唯一 artifact consumer；`fresh-build-windows` 只准备真实 Buildr Web dependency closure。

### 6. Aggregate gate 只消费源码和 evidence

Aggregate runner 的 import graph只能依赖 Node 内置模块和 checkout 内源码。workflow 保留 `macos-latest`、checkout 与 pinned setup-node，但移除 `npm ci`，直接调用 `node test/verification/candidate-ci.mjs aggregate`。Gate继续复用已经证明的macOS runner边界，不为尚未实测的启动收益额外引入Linux模块加载与排障假设；契约测试在没有 `node_modules` 的 clean checkout 条件下验证 aggregate可启动和正确拒绝缺失/重复evidence。

## Risks / Trade-offs

- [版本字段识别遗漏 lockfile 形态] → 只放行三个明确路径；任何未知结构或解析失败回退 full-scope，并用正反例测试锁定。
- [拆 shard 后 owner 丢失或重复] → aggregate contract 从 registry 生成 closed expected set，架构测试比较旧完整 primary step 集合与新并集并拒绝重复。
- [bootstrap 合并降低单 job rerun 粒度] → artifact 实际执行很短，失败重跑仍先经过 cheap preflight，换取移除一次完整 runner setup。
- [可选 release capability 被误当成未验证] → `product.delivery` affected plan仍按 release paths选择同一 primary owners；declaration、契约测试和 Skill说明明确禁止把 optional release set 与 delivery 自动叠加。
- [额外 Windows runner 增加调度波动] → bootstrap 合并减少一个 macOS job，总 job 数不增加；最终用同 tree 多轮 Actions 中位数评估。

## Migration Plan

1. 先交付零测试 fail-closed 和 stale recovery step 退役，确保任何旧 workflow 也不会接受空证据。
2. 在取得 Project verification declaration 精确授权后，将 release capability 改为 optional并更新契约测试。
3. 更新 registry shard topology、Candidate evidence aggregate 和 workflow DAG。
4. 运行 focus/affected、workflow contract、OpenSpec strict 和 clean aggregate canary。
5. Change convergence/archive 后形成 stable Content Target，再执行正式 Task Verification。
6. 交付后用同一 source SHA 手工 dispatch 多轮 Candidate，对比墙钟、runner time、workspace/task shard executor 与 queue duration；若波动掩盖收益，保留正确性改动并单独回退 workflow topology。

## Open Questions

无。`projects/product/verification.yml` 的精确 `requiredForDelivery: true → false` 已取得 Declaration Intake 独立授权。
