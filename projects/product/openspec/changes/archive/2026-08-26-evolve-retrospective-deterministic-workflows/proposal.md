## Why

Task Retrospective（任务复盘）已经检查耗时、Token、重复尝试与流程成本，但尚未明确要求从任务执行事实和既有复盘中探索可固化的确定性流程，导致同类机械步骤继续由Agent反复推理和试错。现在需要把“发现候选、核对边界、交给人共同确认”纳入复盘方法，同时继续遵守Buildr只约束错误、不垄断Agent执行的产品哲学。

## What Changes

- 复盘生成时，从当前可见的Task Record、Development/Review/Verification/Finish/Execution timing、工具结果与已有current复盘中建立有界执行事实图，并主动探索确定性流程候选。
- 候选必须说明重复或高成本证据、closed输入、Owner、停止条件、结果证据、可恢复性、预期收益、仍保留给人和Agent的判断，以及Rule/Skill/Application/CLI/checker/test建议落点。
- 候选必须通过哲学护栏：不得把推荐路径变成唯一合法路径、不得建立通用许可层或生命周期门禁、不得自动修改工作资产或创建承接Task。
- 处理单份或多份复盘时，Agent按当前事实聚类、合并或丢弃候选，向一人或多人展示完整候选与拟Task effects；只有明确确认且事实未漂移后才创建/关联承接Task并处置复盘。
- 保持`buildr.task-retrospective/v2` capability、Result schema、SQLite、CLI/HTTP、binding与Buildr Web不变；不新增分析器、审批、事件、history或workflow registry。
- 无破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-retrospectives`: 扩展Task Retrospective provider的执行事实调查、确定性流程候选探索、跨复盘聚类与人类确认要求。

## Impact

- Buildr npm package中的builtin `task-retrospective` Skill与`buildr.task-retrospective/v2` contract guidance。
- Task Retrospective package static/contract/runtime projection验证。
- Buildr Service current knowledge；用户Workspace在新版Buildr发布并正常update/sync后取得新行为。
- 不改变Task Retrospective Application、SQLite migration、public JSON、HTTP、Buildr Web或其他Task lifecycle authority。
