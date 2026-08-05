## Context

Task Finish 当前由固定五阶段 Product executor 完成交付，其中 `deliver` 在远端回读、runtime render 和 retained Doctor 之后，还根据 `services/buildr/src/**` 等路径安装默认 Buildr CLI 与 development Local App。这个判断只对 Buildr 自举 checkout 有意义，却存在于所有用户 Workspace 都会运行的共用产品路径中，并被 terminal projection 当作 delivered 必要条件。

当前自举 Workspace 已安装 `buildr-self-bootstrap` Component。它通过 `task-finish@append` 贡献 Workspace 专属后续维护，并由 `buildr-self-bootstrap-sync` 处理 package inputs 引发的 retained sync；普通用户 package 不包含该 Component、Skill 或 Contribution。本次变更沿用这条已存在的组合边界，不引入新的公共 hook、registry 或 workflow store。

## Goals / Non-Goals

**Goals:**

- 让共用 Finish 只保留所有 Workspace 都需要的交付、runtime render、Doctor 和 cleanup 事实。
- 让 `buildr-self-bootstrap` 在 Formal Finish 成功后，根据该 Result 绑定的冻结 Task Contribution paths 选择 package sync、development CLI install、development Local App install 与最终 Doctor。
- 保持多路径命中时单一 orchestrator、动作去重和逐动作 evidence。
- 保持 v2 Result/read model 对旧完成记录的安全读取，同时解除旧安装字段的 delivered gate authority。
- 让 post-Finish activation 失败只影响自举 Workspace 当前收敛状态，不改写上游 lifecycle authority。

**Non-Goals:**

- 不把 self-bootstrap 变成用户 Workspace builtin 或公共 Task Finish capability。
- 不新增数据库表、第二 writer、事件总线、daemon、缓存、公共 activation framework、adapter registry 或 capability graph。
- 不改变 Candidate、Verification、Review、decision、handoff、Task Record 或 Environment cleanup 的 authority。
- 不改变 release channel 安装语义，也不触碰稳定版 Local App。

## Decisions

### 1. 共用 Finish 不再分类产品安装影响

`task-finish-impact.mjs` 不再拥有 CLI/Local App 路径分类；共用 executor 只使用现有 root runtime activation plan。`deliver` 仍执行 fast-forward/普通 push、远端回读、必要 render 和 retained Doctor，然后写入 delivered Result。为兼容旧 consumer，可在新 Result 中继续输出 `runtimeInstall: "not-applicable"` 与 `localAppDelivery: "not-applicable"`，但 terminal projection 不再读取它们作为 gate。

选择这一方案，而不是扩展通用 activation plan，是因为 development install 不是用户 Workspace 的 retained runtime 必需动作。通用 plan 继续只有 `none | render-runtime`。

### 2. 扩展现有 self-bootstrap Component，而不新增 orchestrator

保留 Component ID `buildr-self-bootstrap`，把现有专属 Skill 收敛为 self-bootstrap activation。Contribution 仅在 Formal Finish 成功后调用该 Skill；旧 package prepare/publish 特例并入同一入口，避免 sync/install 各自形成重叠 orchestrator。

Skill 输入只来自同一 `buildr.task-finish-result/v2`：Task、run、Agent、canonical Workspace、remote/target、final ref 和 carrier 中冻结的 Task Contribution paths。Skill 不从 HEAD、dirty tree、当前 diff 或时间重建贡献。

### 3. 封闭路径分类与去重动作计划

专属 Skill 使用封闭分类：

- package manifest / workspace package targets：执行 retained self-bootstrap sync，并只提交/推送受管 sync delta；
- Buildr CLI 正式影响路径：使用 Environment Receipt 绑定的 retained Node/CLI identity 安装 development CLI；
- Buildr Local App 正式影响路径：先满足 CLI 依赖，再安装 development launcher，launcher identity 绑定 delivered retained commit；
- 无匹配：`not-applicable`。

同一动作只执行一次，最后统一运行一次 Doctor。每一步保持独立命令和 evidence，便于精确诊断。

### 4. Post-Finish 失败是独立的 activation 结果

Formal Finish 完成后，Skill 运行结果只存在于 Agent 当前执行 evidence 与最终报告，不写回 Finish JSON、SQLite、Task Record、Development Receipt、Review/Verification Result 或新 store。失败报告固定区分“主任务已交付”和“自举 Workspace 激活未完成”，给出失败动作、冻结输入与恢复入口；不得重跑 Formal Verification、生成 Candidate、改写共享历史或重新执行 Finish。

### 5. Package/runtime parity 证明隔离，而不是新增负向配置

用户 package source继续只发布共用 `task-finish`。测试通过临时用户 Workspace 证明不存在 self-bootstrap Skill/Contribution/slot，并通过 Buildr 自举 Workspace Component check/runtime projection 证明专属组合存在。用户 Workspace 不需要显式 `selfBootstrap: false` 字段，也不需要任何自举路径分类代码。

## Risks / Trade-offs

- [风险] Formal Finish 成功后 activation 失败会留下已交付但本机开发入口未收敛的状态。→ 通过清晰双状态报告、逐动作 evidence 和同一专属 Skill 的恢复入口处理，不污染 Formal Result。
- [风险] 保留旧字段可能让外部 consumer 继续误解其权威。→ 新 Result固定写 `not-applicable`，terminal projection和契约明确不再依赖；回归测试覆盖旧完整 v2 Result读取。
- [风险] package sync 可能产生第二个普通 push，使 final remote ref 前进。→ 继续由 self-bootstrap Skill 使用 Git Operations 精确 stage/commit/push/readback，并明确这是 post-Finish Workspace convergence，不改写 Formal Finish 的 carrier/final ref。
- [风险] CLI 与 Local App 同时命中导致重复安装。→ 专属 plan 对动作集合去重；Local App依赖复用同一次 CLI install。

## Migration Plan

1. 先移除共用 executor 的产品路径分类和 installer调用，调整 terminal projection兼容门禁并补齐用户 Workspace 回归。
2. 扩展 `buildr-self-bootstrap` Skill/Contribution，更新 Component integrity与自举组合测试。
3. 收敛 specs、Brief/current knowledge和runtime source，完成 package/runtime parity与正式 Verification。
4. Formal Finish 交付后，从 retained Product checkout投射新版 Component，并以本 Task 的冻结贡献执行 self-bootstrap activation。

回滚时可回退 Product commit和Component contribution；已产生的 Formal Finish Result仍按v2读取。不得通过恢复旧共用 installer gate来修复单次 activation 失败。

## Open Questions

无。现有 v2 schema、Component contribution和Git Operations边界足以实现第一版。
