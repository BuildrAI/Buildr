## Context

Task Finish 的 canonical Result 已由单仓库 `buildr.task-finish-result/v2` 演进为 repository-aware 的 v3。`buildr-self-bootstrap-sync` 目前直接解析 v2，并把顶层 `carrier.root` 解释为整个 run carrier 目录；因此 v3 把实际 carrier 下沉到 `repositories[]` 后，runner 会在任何 effect 前拒绝输入。

这个问题不是简单补认 v3 即可解决。Task Finish Result 是 Product 内部执行状态的公开完整投影，后续可能随 repository、delivery 或 recovery 模型继续升级；self-bootstrap runner 只需要其中一小组稳定语义。若 runner 逐代识别 v2/v3/v4，就会把 Product 内部模型升级传播到 Skill，形成跨模块版本锁步。

本变更跨越 Product CLI 与 bundled self-bootstrap Skill，但不改变 Task Finish 五阶段、SQLite authority、Environment cleanup 或现有 compact/full Result。

## Goals / Non-Goals

**Goals:**

- 由 Product CLI 提供稳定的 `buildr.task-finish-self-bootstrap-input/v1` 投影，隔离内部 Task Finish Result major 演进。
- 让 `task finish run|inspect` 在首次读取、恢复以及 Delivery Adaptation 路径都能输出同一稳定投影。
- 明确多仓库 Workspace repository、全部 run-owned carrier、activation paths 与 recovery facts，避免 runner 推断内部结构。
- 保持未知投影 major、不完整 identity、路径越界和 carrier 不一致时的零副作用 fail-closed。

**Non-Goals:**

- 不让 self-bootstrap runner 兼容任意未知内部 Task Finish Result。
- 不改变 compact/full Result、Task Finish persistence schema、五阶段或 delivery 语义。
- 不创建 SQLite migration，不修改已有 run，也不把 Service repository 的贡献解释为 Workspace 自举影响。
- 不把 self-bootstrap Skill 变成 Task Finish authority 或 repository selector。

## Decisions

### 1. Product 拥有稳定的 self-bootstrap 输入投影

`TaskFinishApplication` 仍以 canonical Result 完成执行与持久化；新的专用 projector 在 CLI 边界把当前及有界支持的旧 Result 归一化为 `buildr.task-finish-self-bootstrap-input/v1`。runner 只校验和消费该 schema，不再引用 `buildr.task-finish-result/v2|v3|...`。

选择专用投影而不是让 runner 对 raw Result 做宽松 duck typing，是因为字段“恰好存在”不能证明 identity、repository ownership、路径或恢复语义仍相同。选择 Product 作为投影 owner，是因为只有 Product 能解释每个内部 Result major 的真实语义。

### 2. 复用 `--detail`，覆盖 inspect 与 run

`task finish inspect --detail self-bootstrap --json` 用于首次判断 current/foreign run；`task finish run --detail self-bootstrap --json` 用于同一 run 的 resume、target-race 与 Delivery Adaptation 恢复。两条路径 MUST 经过同一个 projector。

选择扩展既有 `--detail` 而不是新增旁路命令，可保持 Task Finish 的参数校验、Task Environment execution target、run identity 与恢复 authority 不变。既有 `compact|full` 输出继续保持原 schema 与默认行为。

### 3. 投影表达语义，不复制 raw Result 结构

v1 投影使用闭合、面向自举的模型，至少表达：

- Task、run、Workspace root、target branch、remote 与 Agent identity；
- current status、Finish mode、自举 applicability 与精确原因；
- Workspace repository 的 selector、disposition、carrier identity/root、frozen activation paths 与 delivery refs；
- 排序的 repository carrier 集合及 run-owned carrier container root；
- current phase、resume token/phase、Delivery Adaptation 所需 message/identity；
- cleanup 与 retained activation 是否仍需执行的事实。

projector 负责把 v2 的单 carrier 形态与 v3 的 `repositories[]` 形态映射为同一模型。它不会透传未解释的 raw Result 对象，也不会用顶层兼容单值替代 repository authority。

### 4. 多仓库只由 Workspace repository 决定自举动作

投影必须唯一识别 `selector: workspace` 的 repository。只有该 repository 的 frozen activation paths 可以触发 Buildr sync、Buildr Web install 或 retained Doctor。Service repository 即使有 contribution/carrier，也不能触发 Workspace 根自举动作。

如果 Workspace repository 是 `not-applicable/no-contribution`，投影把 self-bootstrap 标记为 not-applicable；runner 不执行激活，但仍可验证 current/foreign run carrier ownership，避免忽略其他 repository 的残留资源。

### 5. carrier container 与 repository carrier 分离

Product 显式投影 `carrierContainerRoot` 和 repository carrier 集合。v2 中二者可以相同；v3 中 repository carrier 位于 run container 的受控子路径。runner 规范化真实路径，拒绝 symlink、越界、重复 carrier、错误 run identity 或无法关联 resume carrier identity 的输入。

current run 的 ignore 只覆盖已经证明属于该 run 的 container；foreign carrier 判定也消费稳定投影，并验证其全部 repository carriers。runner 不再通过目录层级猜测 Result major。

### 6. 版本演进以稳定契约 major 为边界

`buildr.task-finish-self-bootstrap-input/v1` 同 major 只允许 additive 字段；runner 忽略未知字段。未来内部 Result v4/v5 若未改变 self-bootstrap 语义，只更新 Product projector 与映射测试，runner 无需变更。

若 self-bootstrap 所需字段类型或语义发生不兼容变化，Product 发布 `buildr.task-finish-self-bootstrap-input/v2`，并与 runner 按显式兼容窗口迁移。未知投影 major 必须在任何 effect 前拒绝，不能回退读取 raw Result。

## Risks / Trade-offs

- [投影遗漏 runner 实际需要的恢复事实] → 用 current、foreign、resume、target-race、Delivery Adaptation 与 cleanup journey 测试覆盖所有读取点；runner 不允许回读 raw Result 补齐。
- [Product 与 runner 同次交付期间存在旧 runner] → 新 CLI 投影是 additive；旧 runner 继续零副作用 fail-closed，完成正式交付并激活新版 tracked Skill 后再恢复原 run。
- [宽松字段兼容掩盖 identity 缺失] → 只忽略同 major 未知字段，所有必需 identity、枚举、路径与集合关系继续严格校验。
- [多仓库 carrier 路径扩大忽略范围] → ignore 以 Product 投影的 run container 为界，并先验证全部 carrier root 的 realpath、containment 和唯一性。
- [stable projection 变成第二份 Finish authority] → 投影只由 canonical Result 即时派生，不持久化、不产生 effect、不替代 Task Finish current/completion authority。

## Migration Plan

1. 在 Product CLI 增加 self-bootstrap schema registry、projector、`run|inspect --detail self-bootstrap` 与 checkout/npm coverage。
2. 同一 change 更新 bundled runner，使初次 inspect、foreign inspect 与所有 resume 调用只请求稳定投影。
3. 通过 v2 fixture、v3 multi-repository fixture、unknown major、additive field、nested carrier 与零副作用集成测试。
4. 按正式 Task Finish 交付本 change；激活新的 retained Product/Skill 后，重新运行此前零副作用阻塞的唯一 self-bootstrap closeout runner，再恢复原 owner run。
5. 若需要回滚，回滚 Product 与 bundled Skill 到同一 retained ref；已有 compact/full Result 与 SQLite 数据不需要迁移或回写。

## Open Questions

无。
