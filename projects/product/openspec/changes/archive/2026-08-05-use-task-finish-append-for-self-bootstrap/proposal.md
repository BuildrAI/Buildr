## Why

Buildr自举Workspace只需要在既有`task-finish` Skill末尾追加一段Workspace专属维护说明。为此在通用Skill中增加命名slot会让普通用户Workspace承担一个没有通用语义的扩展点；现有Skill Contribution已支持`@append`，可以更窄地完成相同组合。

## What Changes

- 删除通用`task-finish` Skill中的`post-finish` slot及其契约、文档和测试表述。
- `buildr-self-bootstrap` Workspace Component改用`task-finish@append=<fragment>`。
- Contribution fragment明确只在Formal Task Finish成功后、最终报告完整收尾前调用`buildr-self-bootstrap-sync`。
- 保留自举Skill、固定package inputs、失败结果边界和普通Workspace隔离。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-task-workflows`: Workspace专属Task Finish维护从命名slot组合收窄为末尾追加。
- `buildr-package-assets`: 自举组合验证改为检查`@append`结果，不再要求通用Skill声明slot。

## Impact

通用Task Finish package Skill、Workspace投射、Buildr自举Component定义与fragment、current knowledge、契约测试和canonical specs。无新capability contract，不修改Contribution引擎、Task Domain、SQLite或Formal Finish五阶段。
