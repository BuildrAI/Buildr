## Why

任务复盘中的有效改进目前只能停留在复盘处置说明里，或被迫立即升级为已经进入研发的正式 Task，缺少“已接受但尚未启动”的持久意向状态。为让复盘真正落地，同时避免过早创建 Environment、Change 和规划 artifacts，需要扩展 Task Record 及其复盘来源关系。

## What Changes

- **BREAKING**：Task Record 顶层状态从三态扩展为 `todo | active | completed | abandoned`，新增显式 `activate` 动作，并把默认列表语义改为 `open = todo + active`。
- `todo` Task 只保存最小 Task Record 数据，不得关联 Change，也不创建文件系统任务、Environment、Development 或 OpenSpec artifacts；正式启动后才转为 `active`。
- Task Record 增加复盘来源多对多关系：目标 `todo|active` Task 可关联一个或多个已有复盘的 terminal 源 Task；不建立 action item ID、通用任务关系或第二套 backlog。
- 处理复盘时先基于当前项目事实重评原始复盘，再把仍有效的改进意向关联到已有或新建的 `todo|active` Task；处理报告必须包含原始复盘正文或不可变引用，以及每项结论的处置去向。
- Local App 默认展示 open Task，并支持 `open`、`todo`、`active`、`completed`、`abandoned`、`all` 筛选；目标 Task 展示复盘来源，源 Task 的复盘页展示当前承接 Task。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-record`: 增加 `todo` 状态、显式激活、数据约束及复盘来源关系。
- `task-retrospectives`: 把“处理复盘”扩展为基于当前事实形成结论并关联承接 Task 的落地流程。
- `task-overview-query`: 增加 open/todo 查询及来源关系轻量投影。
- `cli-product-surface`: 扩展 Task create/update/activate 的参数与状态过滤。
- `local-app-web-client`: 调整 Task 默认筛选并展示复盘来源与承接关系。
- `product-agent-skills`: 更新 Task Manager、Task Triage 与 Task Retrospective 的 Agent 流程边界。
- `buildr-package-assets`: 原子交付升级后的 contract、Skill、CLI、SQLite、Local App 和验证资产。

## Impact

- Workspace SQLite migration、Task Record domain/application/repository/query、Task Retrospective application。
- Task CLI、HTTP API、Local App React UI、公开 JSON schema、package/runtime assets 与专项测试。
- `buildr.task-record` 与 `buildr.task-retrospective` capability contract 需要不兼容版本升级；现有 Task 数据迁移后保持原状态和语义不变。
