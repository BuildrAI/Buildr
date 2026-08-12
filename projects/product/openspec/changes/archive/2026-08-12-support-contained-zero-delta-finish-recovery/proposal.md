## Why

现有 Task Finish 在 Delivery Adaptation 中要求 carrier 相对最新 Delivery Baseline 产生非空 tree delta；当原 Task Contribution 已经进入 target、后续提交又修改了重叠路径，而 Agent 审查确认当前 target 已满足任务语义时，协议无法表达“无需新增文件差异”的真实结果，只能持续阻塞或诱导伪造差异。当前已有 blocked run 正处于该状态，因此需要让同一 run 在保持 fail-closed 边界的前提下完成恢复。

## What Changes

- 为 `adaptation-required` 的同一 Finish run 增加显式的 Agent 零差异适配确认；只有 matching resume token、clean run-owned carrier、未漂移 Delivery Baseline 与 current Task Contribution/Development handoff 同时成立时才可采用。
- 零差异适配不创建重复 carrier commit、不修改 target、不重跑正式 Verification；deliver 记录受控的 `already-contained` 结果并继续 retained activation、Doctor 和 cleanup。
- 将 carrier 实际 delta paths 与冻结 Task Contribution paths 分开表达，确保零差异 carrier 仍按原贡献路径执行 runtime activation 与 Buildr 自举安装计划。
- 让既有已进入 `adaptation-required` 的 blocked run 可使用新确认恢复，而不只覆盖未来新建的 carrier。
- 保持 ancestry、run/handoff/Candidate/Content Target identity、source snapshot、baseline、远端回读及未审查语义漂移的现有 fail-closed 边界。
- 本 Change 不包含破坏性变更，不新增数据库、writer、Verification Result、Candidate generation 或远端服务。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-finish-execution`: 增加 Agent 显式确认的零差异 Delivery Adaptation、既有 blocked run 恢复、受控 `already-contained` 交付及其证明边界。
- `cli-product-surface`: 为 matching `task finish run` resume 增加只在零差异适配场景合法的显式确认参数，并在其他场景 fail closed。
- `buildr-package-assets`: 更新 Task Finish Skill、自举路径分类与产品验证，使零差异 carrier 仍使用冻结 Task Contribution 路径完成 activation。

## Impact

- 影响 Task Finish Application、Git carrier adoption/verification、Product executor、CLI registry/help 与 Buildr Task Finish Skill。
- 影响 Buildr 自举 closeout runner 对冻结路径的读取，但不把自举逻辑引入普通 Workspace 或通用 Product executor。
- 增加真实 Git/remote、CLI 参数、零差异恢复、路径分类与 fail-closed 回归测试。
- `buildr.task-finish-result/v2` 仅增加兼容的 additive evidence；现有 schema id、SQLite authority 和正式 Development/Verification/Review 边界保持不变。
