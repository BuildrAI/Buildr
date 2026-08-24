## Context

Task Record、Review、Retrospective 以及 Environment、Development、Verification、Execution Record 和协调读模型已经由 `src/task/module.mjs` 以独立 descriptor 组装。Task Finish 仍由 `src/application/task-finish/`、`src/application/task-terminal-delivery/`、`src/interfaces/**` 和 `src/task/persistence/finish/` 混合承载，并由 `legacy-runtime-module.mjs` 直接注册；轻量 `task finish inspect` 入口也直接组合旧路径。

Finish 是高副作用交付闭环：它消费 current Development handoff，管理 Delivery Carrier、远端 transition/readback、Adaptation、Reconciliation、Activation、Environment cleanup、Maintenance、diagnostics 和 recovery。迁移必须只改变代码归属和装配，不改变任何运行阶段、Result/Receipt、远端或恢复语义。

## Goals / Non-Goals

**Goals:**

- 将 Finish 集群与 Terminal Delivery 完整归入 `src/task`，保留清晰的 Application、Persistence、CLI/Internal Interfaces 边界。
- 让 Bootstrap 只通过 `src/task/module.mjs` 安装 Finish 与 Terminal Delivery descriptor，移除旧全局注册和重复 command owner。
- 保持轻量 inspect、正式 run/reconcile/resume、self-bootstrap、maintenance、diagnostics 与 terminal projection 的全部行为等价。
- 原子更新 Application Payload、Doctor/Verification consumers、测试和服务架构文档，并为最终 legacy exit 留下明确边界。

**Non-Goals:**

- 不改变 Task Development、Verification、Completion Review、Candidate、风险接受或 Task Record 的 authority。
- 不改变 Git delivery 策略、Delivery Carrier 算法、远端目标、恢复 token、Activation、cleanup 或 maintenance 语义。
- 不迁移 Web HTTP Host、System Doctor、通用 Verification executor 或 Infrastructure 技术机制。
- 不修改 SQLite migration、公开 CLI/HTTP/JSON 或 Result/Receipt schema。

## Decisions

### 1. 以两个专业 descriptor 组装同一交付闭环

`task-finish` descriptor 私有组合 Finish Repository、Finish Application、CLI routes 与 retained internal drivers；`task-terminal-delivery` descriptor 依赖 Task Record、Development、Review、Verification 与 Finish read model，提供 terminal delivery Application 和只读 CLI。两者保持独立 writer/read-model authority，但都从 `src/task/module.mjs` 安装。

选择 descriptor 而不是单一“大 Task writer”，因为 Finish current 与 Terminal Delivery projection 的 authority 不同；选择同一个 Child 迁移，是因为 Terminal Delivery 必须消费同一 Finish terminal association，分开会保留临时全局注册。

### 2. Application Finish 使用有意义的私有子目录，其他技术层保持扁平

现有 Finish Application 包含二十余个 delivery、recovery、maintenance 和 diagnostics 私有协作者，迁入 `src/task/application/finish/`。Terminal Delivery Application 保持为 `src/task/application/task-terminal-delivery-application.mjs`。单文件 Finish Repository 迁为 `src/task/persistence/task-finish-repository.mjs`；CLI 和 internal adapters 分别进入 `src/task/interfaces/cli/` 与 `src/task/interfaces/internal/`。

这遵循服务架构的扁平默认规则：只在真实复杂的 Application 层建立 `finish/` 子目录，不为了视觉对称保留单文件 persistence 子目录。

### 3. 迁移真实入口，不建立兼容转发文件

所有生产和测试 import 原子更新到新路径。`legacy-runtime-module.mjs` 使用 Bootstrap 注入的 Task Finish/Terminal Delivery installer slot，不再直接注册 Repository 或 Application。CLI registry 的 Finish/Delivery route descriptors 由 Task module contribution 提供；轻量 inspect Bootstrap 直接组合新 Task 路径，但仍维持其低成本启动边界。

不在旧目录保留 re-export、双注册或双写。尚未迁移的 Doctor、Verification executor、self-bootstrap runner 直接消费 Task module port或新路径；最终 legacy convergence 再移除与其他模块有关的 Facade。

### 4. 行为等价由高风险闭环而非目录断言单独证明

结构测试证明唯一 owner、路径退出、module dependency 和 Application Payload 闭包；现有 Task Finish unit/integration/system/self-bootstrap journeys 证明 run/resume、carrier、adaptation、reconciliation、remote readback、activation、cleanup、maintenance、diagnostics 和 terminal delivery 等价。SQLite migration inventory 与 checksum 必须零变化。

## Risks / Trade-offs

- **大规模 import 移动遗漏 package/test consumer** → 迁移前建立生产、测试、tools、package 与动态路径 inventory；迁移后扫描旧路径并执行 Application Payload 与 installed-layout 验证。
- **Bootstrap 安装顺序改变 Finish 私有依赖** → descriptor 显式声明 Task lifecycle 与 Infrastructure requires，模块 registry 对缺失或重复 capability fail closed。
- **轻量 inspect 无意加载完整 runtime** → 保留专用 lightweight bootstrap，只把 Repository/Application import 指向新路径并增加入口测试。
- **self-bootstrap/recovery 动态路径仍指向旧目录** → 将 capsule manifest、driver path、static validation 与相关 fixture 作为同一次原子更新范围。
- **纯目录迁移掩盖行为变化** → 禁止修改 schema、phase、diagnostic、effect 和 writer 逻辑；任何行为缺陷另开任务。

## Migration Plan

1. 增加 Task Finish/Terminal Delivery descriptors、ports 与 module contributions，并先用结构测试锁定唯一装配。
2. 移动 Application、Persistence、CLI/internal adapters，批量更新生产、package、tools 和测试 import/dynamic path。
3. 切换 Bootstrap/legacy slot、CLI registry 与 lightweight inspect，删除旧入口。
4. 更新服务架构文档、technical/service knowledge、Verification owner 和架构测试。
5. 运行 focused/affected feedback、严格 OpenSpec convergence、正式验证与 Task Finish；若迁移失败，回到本 Task worktree 修复，不在 Finish run 内改写 Candidate。

## Open Questions

无。Web HTTP、System Doctor 与最终 legacy exit 继续由父任务后续 Contribution 处理。
