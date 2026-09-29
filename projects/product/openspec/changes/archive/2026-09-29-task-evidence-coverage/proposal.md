# 补齐任务过程材料覆盖

## Why

Buildr 任务页面的工作路径已有"任务需求、方案审查、实现审查、开发验证、用户确认"等固定节点，但实际数据大面积为空：自举 workspace 中 36 个正式任务（Task）没有任何一条审查（Review）记录，34 个完成任务中只有 18 个保存了开发验证报告（Task Verification Report），未关联变更（Change）的任务在需求节点没有任何正文。诊断显示这不是门禁缺失——审查与验证在设计上就是可选证据——而是三个真实衔接缺口：任务级需求没有明确承载物与稳定展示位、审查完全依赖智能体（Agent）逐任务主动判断而产生全有或全无的结果、登记完成前缺少"先补登未保存证据"的就近提醒（终态后审查与验证写入会被拒绝，窗口永久关闭）。

## What Changes

- 任务需求：明确 Task `intent`（目标与说明）是每个任务必写的简洁任务需求，`task-manager` 增加写法指引；Buildr Web 的任务需求节点默认直接展示任务目标正文，关联变更的 `brief.md` 作为补充需求同层切换。
- 方案审查与实现审查：把默认触发绑定到语义治理路径而非逐任务判断——走 `change-flow` 的任务在规划材料齐备后默认执行一次方案审查（Planning Review）、在实现与验证完成后默认执行一次实现审查（Completion Review）；`code-only`、`spec-maintenance` 等路径保持按需触发。审查继续保持可选证据性质，不成为完成、归档或交付门禁。
- 开发验证衔接：收尾登记任务完成前，若实际执行过检查或审查但尚未保存对应报告/结果，先在任务 `active` 期间登记再完成，修复"终态后无法补登"的窗口问题；不补造未发生的检查。
- `brief.md` 自查：`openspec-propose` 增强指引要求声明规划材料齐备前确认 `brief.md` 实际存在。
- 用户确认定位：说明该节点由 acceptance 待办事项填充，成果确需人验收确认时登记对应事项；不新增默认确认环节。

## Capabilities

### Modified Capabilities

- `agent-task-workflows`: 任务需求写法指引、变更路径默认审查触发、收尾登记证据提醒与 `propose` 的 `brief.md` 存在性自查场景。
- `buildr-web-client`: 任务需求节点默认展示任务目标正文、变更 Brief 作为补充需求的行为。

## Impact

- 工作空间技能（Skill）源资产：`task-manager`、`task-review`、`task-triage`、`task-finish` 与 OpenSpec `propose`/`apply` 增强片段的指引文本。
- Buildr Web 前端：任务详情需求节点的内容目录、默认选中与空态文案。
- 当前认知：`knowledge/docs/architecture/task-system.md` 对需求节点与用户确认节点的表述随实现校准。
- 不改动 Task Review/Task Verification Application、数据模型或能力契约；审查与验证仍为可选证据，不新增门禁。
