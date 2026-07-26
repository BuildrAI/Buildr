## Why

当前 `task-board` Skill 同时重复承担路由说明、领域模型、页面规范、操作流程、检查清单和 capability 结果契约，正文偏长且存在旧名称残留、create/update 判断不明确和既有看板匹配可能歧义等问题。需要在不削弱任务看板核心边界的前提下收敛内容，并让操作结果更确定、更容易验证。

## What Changes

- 将 Skill 正文重组为适用范围、输入与事实、定位与操作、内容模型、更新与验证、结果六个连续步骤，删除重复说明。
- 缩短并统一 Skill frontmatter、workspace manifest 和 package builtin 的 routing description。
- 修复当前回复中的“驾驶舱”残留；旧称只继续作为用户意图，不再出现在新产物或当前回复中。
- 明确基于 Project、精确 task identity 和内嵌 `meta.taskId` 解析唯一看板；歧义或冲突时返回 `blocked`。
- 明确先生成并验证候选 HTML，再替换既有文件；失败时保留原文件，并收敛 `created|updated|aligned|blocked` 语义。
- 保持 `buildr.task-board-maintenance/v1` capability identity、输入输出、模板 schema 和现有 consumer binding 不变，不包含破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-board`: 收敛 Skill routing 和正文结构，补充确定性的 identity 解析、create/update、候选验证与失败保留要求。

## Impact

- `projects/product/services/buildr/package/targets/workspace/skills/buildr/task-board/`
- package/workspace Skill manifest 中的 `task-board` description
- `projects/product/openspec/specs/task-board/spec.md`
- Buildr package、builtin/runtime 投射和受影响 consumer 的契约测试
