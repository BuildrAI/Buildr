# Task 前端功能切片收敛

Task详情页已经迁入feature，但内部命名和状态职责仍混杂。本次把源码目录统一为`features/task`，让详情、动作、Evidence、关联产物和复盘分别由真实Hook管理，页面只保留路由、Tab与组件组装。

不改变页面布局、稳定DOM标识、HTTP路由、公开Task Record JSON identity、SQLite或业务规则，也不引入全局Store和新依赖。主要风险是请求取消/刷新时序及generated DTO路径漂移，通过复用现有读取生命周期、生成检查、严格类型构建和现有交互测试控制。

技术入口：[方案](proposal.md)、[设计](design.md)、[规范变化](specs/buildr-web-client/spec.md)、[实施清单](tasks.md)。
