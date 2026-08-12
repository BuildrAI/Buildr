## Context

Task Environment Receipt 已登记创建 Environment 时的 controller source、CLI 与 adapter；它同时是 `inspect` 对既有执行根做 CLI、Runtime、依赖与 projection probe 的输入。安装版 Local App 的 `runtime.productRoot()` 则来自 App bundle，不等于 Receipt 的 retained controller source。当前实现把两者的差异放进 mutation manager 校验，使只读 `inspect` 在读取前被拒绝，继而让 Task-scoped Change resolver 错误地回退到 retained Project。

Task-scoped resolver 已经只接收 canonical Workspace、Task ID 与限定 `project/change`，并只通过 Task Environment Application 取得候选根；全局 Change collection 已经 retained-only。这些边界必须保留。

## Goals / Non-Goals

**Goals:**

- 让安装版 Local App 和其他非 manager 的只读消费者，可通过共享 `inspect` 对 matching Receipt 的执行根取得真实 read model。
- 保持 `prepare`、resource register/release、`cleanup` 的 retained manager source/adapter/clean evidence 校验完全不变。
- 让只存在于 matching worktree 的 Change 在 Task detail 中以既有 candidate provenance 展示，并保留 retained-only 全局索引。
- 用直接 Application 与 Local App route 回归测试固定此边界。

**Non-Goals:**

- 不引入第二个 Receipt reader、路径输入或持久 Change 状态。
- 不允许 bundle、candidate 或任意 caller 创建、恢复、认领、释放或清理 Environment。
- 不改变 Receipt schema、Task Record、Global Change API 或 worktree 生命周期。

## Decisions

### `inspect` 使用 Receipt controller 作为只读 probe controller

`inspect` 在已经从 canonical Task persistence 取得 matching Receipt 后，直接构造 Receipt controller 来运行既有 provider/foundation/resource probe；不再把调用方的 `runtime.productRoot()` 当作 Environment Manager。Receipt controller 已由唯一 Application writer 在 Environment 准备时写入，且后续 probe 仍会验证实际 CLI、Runtime、依赖、projection 与 provider 状态。

替代方案是让 Local App 直接读取 Receipt 或将 bundle root 映射回 retained source。前者会创建第二套 reader 和 ready 判断；后者把 bundle 版、CLI 版和 future reader 的来源耦合到硬编码路径，均违反现有 Application boundary，因此不采用。

### mutation 继续唯一地要求可信 retained manager

`prepare`、resource register/release、`cleanup` 和明确 controller assertion 继续调用既有 `assertEnvironmentManager`。只有这些会产生或可能产生持久效果的入口要求 sourceRoot/adapter 一致和 Git clean evidence；只读 `inspect` 不写 Receipt，也不获得任何 mutation authorization。

替代方案是为 bundle 新增一个 manager allowlist 或让所有入口跳过 source mismatch。前者引入新的身份权威，后者会放宽写入边界，均不采用。

### 回归以 bundle root 差异覆盖完整投射链路

测试会构造 Receipt controller 与模拟 App bundle product root 不同的场景：Application `inspect` 必须仍为 ready，而 mutation 仍返回 manager mismatch/forbidden；Task-scoped Change 的 Local App detail route 必须返回 candidate-only Change。现有 retained-only list assertion 保持不变。

## Risks / Trade-offs

- [Receipt controller 指向已不存在或不可执行的 source] → `inspect` 的既有 foundation probe 返回 blocked；不会退化为猜测路径或写入恢复。
- [调用方误把只读结果视为 mutation authorization] → Application 不向结果授予 manager capability，所有 mutation 仍在入口重新校验。
- [bundle 与 retained source 版本不同] → read model 使用 Receipt 的 creation-time controller 进行实时 probe；controller identity 仍不是 readiness 或 lifecycle generation 门槛。

## Migration Plan

无需数据迁移或 Receipt schema 变更。更新 Buildr 服务和 App bundle 后，已有 matching Receipt 在下一次 Local App Task detail 读取时自然恢复 candidate 投射；回退代码只会恢复旧的读取阻断，不会修改现有 Receipt、Task Record 或 Change。

## Open Questions

无。
