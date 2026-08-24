## Context

任务二已经把日常核心 Full 固定为 52 个 primary owners，并把 14 个 Candidate/Release 专属 owner 移出日常 lane。当前性能问题因此不再主要是“选错测试”，而是执行面反复创建临时世界：大量测试独立初始化 Workspace、Git、SQLite、runtime 和 CLI 子进程；外层 DAG 只看 step，内层 `node:test` worker 又独立扩张，实际 CPU、process、Git 与 filesystem 压力不可由一个统一预算解释。

项目已有 `task-lifecycle-system-context.mjs`，能够准备不可变 Task Workspace seed、为 case 复制 sandbox 并检测 seed 污染，但它绑定具体领域和 System runner：每个 outer owner process 仍会重新准备，其他 Integration/Component owner 没有统一 Context contract，registry 也不能表达 Context 与 worker 资源需求。

约束如下：

- 继续使用 `node:test`；Vitest 只作为未来人体工程学选项，不能成为本次性能收益的前置条件。
- Git、SQLite 多进程、CLI、Workspace、Finish、自举与 cleanup 若是主要待证明事实，必须继续穿过真实边界。
- Product 测试执行策略属于 `test/`，不得进入 npm package 或变成所有 Project 的 Verification schema。
- 一项关键行为只有一个 primary evidence owner；迁移不能靠复制较快测试后保留原重型 happy path。
- 180 秒是 Parent 的优化目标，不是删证据许可；无法达到时必须以纯 Core 多轮事实诚实校准。

## Goals / Non-Goals

**Goals:**

- 建立 runner-independent 的 Buildr Test Context，统一 context key、prepare、inspect、sandbox lease、release、dirty detection、eviction 和 timing。
- 让同一 verification plan 中的多个 owner 共享只读 seed，同时让每个 worker/case 获得独立可写 sandbox。
- 以 Task 领域为首个纵向样板，把同进程规则、SQLite、CLI/Git 与完整黄金旅程放回最低充分边界。
- 让 outer DAG 与 inner worker 使用同一层级资源 grant，避免 outer × inner 过度订阅，并让跨 Full/affected 的共享资源等待、释放可观察。
- 用独立 52-step Core 基线、focused 多轮和竞争压力验证收益与隔离，保持 Candidate/Release owner 集合完整。
- 形成一份以真实实现为准的完整验证框架文档。

**Non-Goals:**

- 不迁移到 Vitest/Jest，也不重写 `node:test` runner。
- 不把所有现有 fixture 一次性迁移；优先处理 Task 生命周期与能形成明显复用收益的 Workspace/Git seed。
- 不为追求 wall-clock 把真实系统边界替换成 mock，或扩大未验证的并发上限。
- 不改变 Project declaration、Task Verification Result 或正式 Release 的产品级 schema/authority。

## Decisions

### 1. Test Context 位于 `test/context/`，不进入生产 `src/infrastructure/`

`src/infrastructure/` 随 npm package 交付，只能承载产品运行所需的通用 SQLite、Git、filesystem、process 与资源协调机制。Context cache、seed、sandbox 和 test reset 是 Product 测试策略，authority 放在 `services/buildr/test/context/`：

```text
test/context/
├── runtime.mjs                 通用 Context/Pool/Lease 生命周期
├── registry.mjs                稳定 context profile 与 provider 注册
├── node-test.mjs               node:test 的最薄 acquire/release adapter
└── providers/
    └── task-lifecycle.mjs      Task Workspace 不可变 seed
```

`test/helpers/` 保留兼容入口并委托新 runtime，避免一次性改写全部测试。生产 `src/verification/infrastructure/resource-coordinator.mjs` 继续只拥有通用跨进程 lease；test scheduler 组合它，不把 Context 语义写入产品 runtime。

替代方案是把框架放进 `src/infrastructure/`，优点是路径看起来统一，缺点是会把 Product test policy 发布进包、模糊生产与测试 authority，因此不采用。

### 2. Context contract 由稳定 key 和 provider 定义，Pool 只编排

每个 provider 声明：

- `id` 与 `version` 组成稳定 context key；
- `prepare(seedRoot)` 只建立共同且非主要被测事实；
- `materialize(seedRoot, sandboxRoot)` 默认复制，也允许 provider 使用安全的文件系统优化；
- `inspect(seedRoot)` 与框架 tree digest 共同证明不可变；
- `resetStrategy`、`parallelSafety`、`footprints` 与默认 resource demand；
- provider-owned cleanup。

Pool 按 key 在一次 verification plan 内最多 prepare 一次，生成只含 context root、marker identity 和 profile 的闭合环境投影。worker 取得 sandbox lease 前重新 inspect；release 时先验证 seed identity，再清理 sandbox。污染、路径越界、symlink alias、未知 key 或 cleanup ownership 不可证明时 fail closed。

直接运行单文件时，worker-local Pool 在进程内最多准备一次等价 Context；经过 outer runner 时只消费继承的只读 seed，不静默另建同 key 基线。

### 3. Context scope 与 test boundary 分离

Context 只是降低非主要前置成本，不改变测试分类：

- Component：同进程 Task Domain/Application context，外部 Git/CLI/Workspace 使用 fake/in-memory port；
- Integration：真实 SQLite file/migration、child CLI、Git repository 或 filesystem protocol；
- System：完整公共入口、Task Environment/Worktree、Finish、自举与并发 Acceptance 黄金旅程。

SQLite 同进程 case 可以使用 transaction/savepoint；多进程 case 使用独立 database snapshot/文件。Git/Workspace 不共享可写 index、refs 或工作树，只共享不可变 seed 并物化独立 sandbox。Process/CLI Context 只由真正验证进程协议的 owner 使用。

### 4. registry 声明 Context profile 与层级 resource demand

step/suite 增加闭合字段：

- `contexts`：需要的 context profile keys；
- `isolationMode`：`none | transaction | sandbox | full-lifecycle`；
- `resetStrategy`：`none | rollback | snapshot | recreate`；
- `parallelSafety`：`worker-safe | bounded | exclusive`；
- `resourceDemand`：CPU worker、process、Git、workspace I/O 等数值需求。

现有 `resources` 继续表示需要跨 plan lease 的命名资源；`resourceDemand` 表示单个 plan 内的数值容量。planner 在启动前验证 provider、字段和值，契约测试保证 Candidate 文件 union、唯一 owner 与 Release exclusions 不变。

### 5. outer scheduler 产生 grant，inner runner 只能消费 grant

execution profile 同时声明 global/class/resource capacity 和可分配 worker capacity。scheduler 只在所有 demand 均可满足时启动 step，并把实际 grant 写入 execution context；executor 从 grant 生成 `BUILDR_VERIFICATION_WORKER_BUDGET` 或 `--test-concurrency`，inner runner 不再自行扩大。

Context prepare/materialize 本身也计入 context/resource timing。Full 和 affected 继续通过现有协调根共享 `workspace-saturating`、`task-lifecycle-heavy` 等跨进程 lease；本次按实测补齐 Git/workspace/process 压力声明，但不把 CPU throttle 误作共享状态锁。

替代方案是简单增加 global concurrency。它会扩大 process/Git/filesystem 竞争并放大尾延迟，不采用。

### 6. Task 领域采用渐进迁移与 primary owner 转移

第一批迁移顺序：

1. 把现有 Task lifecycle seed 改为通用 provider，并让 outer plan 与直接 System runner共享同一 Pool。
2. 审计 `integration-task-development`、`integration-task-execution-records`、`integration-task-finish*`、`system-task-lifecycle`、`system-task-finish` 的公共结果和重复准备。
3. 能同进程充分证明的 domain/application case 移入或复用 Component owner；真实 SQLite/CLI/Git contract 留在 Integration。
4. 保留一个完整 Task lifecycle、一个完整 Finish delivery、自举与 concurrent-task-acceptance 黄金路径；初始化、迁移和 cleanup owner继续独立 recreate。

旧重型 case 只有在 primary evidence 明确转移且 Candidate union/contract 反例通过后才删除或改边界。

### 7. 性能验收区分范围、累计工作与争用

先保存实现前的纯 52-step Core run；实现后至少取得：

- 关键 owner focused 两轮成功；
- 纯 Core 至少三轮成功，报告中位数、波动和累计 executor work；
- 一次 Core/affected 竞争压力，证明 queue、resource wait、release 与失败后重跑；
- Context seed identity、prepare/materialize/release/cleanup timing 和污染反例；
- Candidate 66-step membership、唯一 tarball与 Release evidence contract不变。

wall-clock 改善只是观察结果；正确性 step 不因单次耗时波动失败。若必要 owner 仍无法满足 180 秒，输出新的可证明下限和残余长尾，交给 Parent reconcile 预算。

## Risks / Trade-offs

- **[共享 seed 被误写]** → seed 只读约定、realpath/containment 检查、前后 tree identity 和 fail-closed cleanup共同防护。
- **[复制 sandbox 本身仍昂贵]** → 先测 materialize 成本，再按 provider 选择最小 seed 或安全 filesystem copy 优化；不提前依赖平台专属 reflink。
- **[Component fake 与生产语义漂移]** → fake 只替代非主要外部边界；真实 adapter/SQLite/CLI/Git contract由独立 Integration owner证明。
- **[层级预算过于保守导致变慢]** → 用同 tree focused/Core 多轮校准 demand 和 capacity，不凭静态猜测扩大或缩小。
- **[Context framework 变成第二套 runner]** → runtime 只提供 Context/Pool/Lease，不拥有 test discovery、assertion、reporter 或 suite lifecycle；`node:test` adapter保持薄层。
- **[一次迁移范围过大]** → Task 领域先行，其他 Workspace/Runtime owner只在当前收益数据支持时接入，并把残余范围写入 handoff。

## Migration Plan

1. 记录纯 Core 基线与最慢 owner/context 使用图。
2. 实现通用 runtime、provider registry、node:test adapter和契约/污染测试。
3. 迁移 Task lifecycle helper与 System/plan runner，保留兼容导出。
4. 加入层级 demand/grant并校准 Task owners；再做最低充分边界迁移。
5. 运行 focused/Core/争用验证，必要时调整 demand、预算或残余范围。
6. 以最终代码、registry和计时结果编写验证框架文档、current knowledge和术语。
7. 形成 OpenSpec deterministic convergence 与 archive readiness，随后由正式 Task 生命周期完成 Verification、Completion Review 和 archive/Finish。

回滚时可以逐 owner 移除 `contexts`/`resourceDemand` 并回到兼容 helper；不得删除 Context 污染证据或已转移 primary owner，除非先恢复等价主证据。

## Open Questions

- APFS clone/reflink 是否能在所有受支持本地/CI 平台稳定使用，由 materialize benchmark 决定；第一版以可移植复制为正确性基线。
- Vitest 是否减少 fixture adapter 样板，在本次 runner-independent runtime稳定并取得收益后再单独评估。
