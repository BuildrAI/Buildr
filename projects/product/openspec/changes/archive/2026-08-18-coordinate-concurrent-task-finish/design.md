## Context

Formal Task Finish 已经把 `prepare` 放在 run-owned Delivery Carrier 中，并只在 `deliver` 对 `remote + targetBranch` 获取短 target lease。因此，不同 Task 原本可以并行建立 carrier、做等价检查和 Delivery Adaptation；真正需要互斥的只是共享 target 写入。

Buildr 自举 Workspace 另有 workspace-only `buildr-self-bootstrap-sync` runner。它消费 `complete` 或 retained Doctor blocked 的 Finish Result，可能继续执行 retained workspace sync、successor commit/push、Development Local App 安装或重启、开发入口验证和最终 Doctor/same-run Finish resume。当前 runner 未加入 Finish target lease，而且把任何 foreign carrier 都当作 activation predecessor。这会把隔离资源误判为共享占用，也可能直到 sync、安装和重启后才发现 target 已前进。

此外，Delivery Adaptation 的公开 Result 只给出提交 subject/identity，没有给出 carrier 必须保留的完整冻结 message；Task Environment 已有的 Preparation Plan 也没有形成可移植的 carrier 准备提示。实际恢复因此容易先产生一次错误 commit，再由 resume 暴露缺失 trailer 或依赖。

约束如下：

- 普通用户 Workspace 仍只有 Formal Finish 五阶段，不获得 Buildr 自举 Skill、runner 或新增自举动作。
- `task_finish_current`、Task Finish Application 和既有五阶段状态机仍是 Finish authority；不建立队列、全局任务调度器或第二套恢复状态机。
- self-bootstrap runner 仍是 workspace-only、无持久 runner state 的确定性编排器。
- 完整 commit message 只可在 Delivery Adaptation 恢复窗口按需公开，不能变成 Task Record、Environment Receipt 或 terminal Result 的常驻副本。

## Goals / Non-Goals

**Goals:**

- 只串行化同一 target 的 delivery/self-bootstrap activation 临界区，让其他 Task 继续并行准备和适配 carrier。
- 让 `complete` 与 retained Doctor blocked 两种自举模式都在任何 activation 副作用前持有同一 target lease。
- 对可证明 owner/path/identity 的 foreign carrier 保持隔离共存；只让不可证明资源或真实 target lease 占用阻塞。
- 在 sync、安装和重启前收敛 latest target，并对同一 run 的 target-race 最多执行两次 Product resume；需要语义适配时先交回 Agent。
- 让 Delivery Adaptation 的 compact/full Result 直接提供完整冻结 message 与可移植 Preparation hints。
- 对 push 后 remote readback 的暂态失败做有限重试，同时保留每次观察和最终精确诊断。

**Non-Goals:**

- 不要求一个 Task 完成 carrier、push、自举、Doctor、cleanup 后，另一个 Task 才能创建 carrier。
- 不向普通用户 Workspace 增加 self-bootstrap closeout，也不改变 Candidate、Formal Verification、Completion Review 或 Task Record writer。
- 不自动解决 Git/语义冲突，不替 foreign carrier owner 做 cleanup 或 occupancy release。
- 不新增 capability contract、任务队列、持久 retry counter、通用 resource scheduler 或完整原型平台。

## Decisions

### 1. 复用 `task_finish_current` 的 target lease，而不是串行整个 Finish

Product repository 增加一个仅供内部 driver 使用的 current-owner lease 操作：以 canonical Workspace、Task ID、run ID、`remote:branch` 和用途获取、刷新或 token-fenced 释放现有 target lease。普通 Finish 继续在 `deliver` 使用 60 秒 lease；self-bootstrap activation 使用较长但有上限的 lease，并在每个可能产生副作用的阶段前刷新。

SQLite migration 只放宽 `task_finish_current` 的 lease 约束，使 matching terminal `complete` row 也可临时持有 lease；不创建第二张 lease 表。Repository 必须验证 row 的 Task/run/target identity，且 terminal owner 的过期 lease可被后续 owner接管。retained Doctor blocked run 的 acquire 保持同 run 可重入，使 runner 最终调用 same-run Finish resume 时仍复用同一个目标所有权；Finish terminal finalize 清除 lease 后，runner 的最终 release 必须幂等。

选择该方案是因为 complete Result 仍可能触发 sync、安装或重启，只支持 blocked run 会留下真实竞态。把 lease 从 `deliver` 一直保留到外部 runner 又会改变所有普通 Workspace 的短 lease 语义；新建通用队列或 scheduler 则超过本次问题范围。

### 2. self-bootstrap runner 在 preflight 后、activation 副作用前获取 lease

Runner 通过 retained Product source 的内部 driver 取得 lease，不直接 import npm package 或 Application 模块。driver 返回结构化 acquire/refresh/release evidence；runner 把 target occupied 表达为可重试 blocked diagnostic，effects 为空。lease 获取成功后，runner 才允许 fast-forward、sync、commit/push、安装/重启、开发入口验证和 final Doctor/resume，并在退出路径 token-fenced release。

lease 只覆盖共享 target/retained activation 窗口。carrier discovery、owner 证明、Task Finish `prepare`/`verify` 和 Agent Delivery Adaptation 不需要该 lease，因此其他任务不会因当前 activation 而停止形成自己的 carrier。

### 3. proven foreign carrier 是隔离事实，不再是 predecessor

Runner 仍枚举固定 carrier 根并用 Product inspect 证明 schema、run、Workspace、真实非 symlink 路径、carrier identity 和 resume identity。全部可证明的 foreign carrier 会进入只读 observations，并作为精确 untracked ignored roots 参与 retained Git cleanliness；runner 不读取其业务内容、不修改、不删除、不替 owner resume。

只有 symlink/path escape、inspect 失败、identity 漂移或其他无法证明所有权的条目保持零 activation effect blocked。`cleanup_pending` 与 abandoned occupancy release 仍可给出 owner action 作为建议，但不再是当前 activation 的前置步骤。真实并发写入由 target lease 而不是目录存在性判断。

### 4. latest target 与 same-run target-race 在 activation 前有界收敛

每次适用 invocation 获取 lease 后都读取/fetch latest target，并只在 clean retained checkout、可 fast-forward、无 merge 且 descendant commits 具有 Buildr Task/self-bootstrap provenance 时前进 retained branch，不再依赖 `--retry-after-foreign-clear` 特殊模式。

对 retained Doctor blocked Result，若 latest target 已越过 Result 的 frozen delivery ref，runner 在 sync、安装或重启前先用 current resume token调用一次 Product Finish。若返回 matching `task-finish.target-race`，最多再用新的 exact token调用一次，由 Product 自己重建 carrier、执行 containment 或返回 Delivery Adaptation。第二次以后仍 target-race、任一 identity 不匹配或其他 blocked/failed 都停止，不形成循环。若返回新的 doctor-blocked/complete Result，runner 重新生成 plan 并继续；若返回 Delivery Adaptation，runner 返回 Product carrier、resume 和 adaptation guidance。此时除已经完成的可证明latest-target fast-forward外，不产生sync、commit/push、安装、重启、入口验证或Doctor effects。

对 complete Result，runner 只在 lease 内采用可证明 latest Buildr-owned descendant 作为 activation base，不重开已完成 Finish。这样多个已交付 Task 可以按最新 target 依次激活各自 frozen paths。

### 5. Delivery Adaptation guidance 是 blocked-only 恢复投影

Canonical Finish Result 在且仅在 current failure 为 `task-finish.delivery-adaptation-required` 时增加 `deliveryAdaptation`：

- `expectedCommitMessage`：run-owned 完整规范化 message，包含 subject、body 和确定性 `Buildr-Task` trailer；
- `preparationHints`：从 current Environment Preparation Plan 派生的 required steps，只包含相对 Environment root 的 cwd/executable、声明 args、timeout 和 outputs；不包含环境变量、secret、stdout/stderr 或绝对 Task worktree 路径。

Agent 将这些相对路径映射到 run-owned carrier root 后执行适用准备并保持 exact message。compact 投影必须保留该字段，因此无需额外读取 full Result；failure 解除或 terminal 后字段消失。完整 message 继续只由 Finish run 持久化，不复制到其他 authority。

### 6. remote readback 只重试暂态观察失败

Task Finish 和 self-bootstrap 的 push 后 `ls-remote` 使用固定小次数重试。每次命令仍记录 operation evidence；非零退出可继续下一次观察，成功但 ref mismatch 立即进入既有 target-race/remote-drift，最终仍非零则保留原 run、carrier、lease 释放和精确 `remote-readback-failed` 诊断。重试不重复 push、不隐藏已发生的 remote effect，也不建立持久 counter。

### 7. 不新增 capability contract

target lease driver、workspace-only runner 和 Task Finish executor 都随同一 Buildr Product checkout 发布，并由现有 `task-finish-execution`、`task-closeout-orchestration` specs、Component integrity 与跨层测试共同约束。当前没有第二个独立 provider 或跨版本 consumer，因此第一版不建立新的 capability contract；若未来普通 Workspace 或外部 Service 需要稳定 lease API，再单独评估。

## Risks / Trade-offs

- [self-bootstrap 单步超过 lease horizon] → activation lease 使用明显长于单个既有 runner 操作的有界 TTL，并在每个副作用阶段前刷新；Product 测试覆盖过期 terminal owner 接管和 token-fenced release。若后续出现真实长任务，再引入 heartbeat，而不是本次先建通用租约平台。
- [terminal row 临时持有 lease 改变 SQLite invariant] → 连续 migration 原子重建约束；repository 只允许 matching complete/eligible blocked owner，terminal payload 与其他普通列不变，Doctor 继续报告过期 lease。
- [忽略 foreign carrier 掩盖 dirty tree] → 只忽略经过 Product Result 和 realpath 双重证明的精确直接目录；tracked/staged carrier 差异和任何 unprovable entry 仍 fail closed。
- [早期 resume 自身产生 Product delivery effect] → runner 只在持有 target lease 后调用同 run Product Finish，Product 仍是唯一 writer；“无 activation effect”仅指 sync、安装、重启等 self-bootstrap effects。
- [完整 message 暴露范围扩大] → 仅 blocked recovery projection 暴露，terminal/Execution Record/其他 authority 不保存或投影；Preparation hints 排除 env 与绝对源路径。
- [有限 readback 重试增加少量等待] → 固定小次数、无高频轮询，只针对非零观察失败；ref mismatch 不重试。

## Migration Plan

1. 以连续 SQLite migration 放宽 terminal target lease invariant，并先用 repository unit/integration tests验证旧数据无损迁移、过期接管和 release fencing。
2. 增加 retained internal lease driver，再接入 workspace-only runner；普通 npm package 与用户 Workspace 不获得 runner。
3. 改造 foreign carrier observations、latest-target early convergence 和 bounded Product resume；更新 Skill/Component contribution 与组合测试。
4. 增加 Delivery Adaptation guidance 和 readback retry，并验证 compact/full、隐私边界及无重复 push。
5. 收敛 current knowledge，运行 strict OpenSpec、affected/full Buildr verification 与 self-bootstrap contract tests。

回滚时必须整体回滚 Product 代码、workspace-only runner 和 migration 之后的运行版本；不得让旧 runtime 写入已升级 Structured Store。已生成的 Delivery Carrier 仍由原 Task Finish owner 按现有 cleanup/occupancy 规则处理。

## Open Questions

无。若真实 runner 操作未来需要超过本次有界 activation lease horizon，再以运行证据评估 heartbeat；第一版不预建。
