## Why

Task 前端虽已迁入 feature，但目录和文件仍以`task-record`命名，详情页继续承担请求、表单、弹窗、关联产物和证据状态，两个所谓Hook只返回API函数。现有结构使组件边界名实不符，也让页面继续膨胀。

## What Changes

- 将前端功能目录统一为`src/features/task`，内部Client命名统一为`taskApi`。
- 让`useTaskDetail`实际管理详情读取，让`useTaskActions`管理编辑、完成和放弃，让`useTaskArtifacts`管理Brief、原型和文档入口。
- 让复盘组件经专用Hook访问API，组件不直接承担Client调用。
- 使用生成DTO替代Evidence展示中的`any`。
- 保持页面交互、稳定DOM标识、HTTP路由和公开Task Record JSON协议不变。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `buildr-web-client`：更新Task前端feature的目录、Hook职责和页面/组件依赖约束。

## Impact

影响`buildr-web/src/features/task`、路由导入、Task DTO生成目标、相关前端架构测试和Buildr Web当前认知。没有数据库、HTTP路由、JSON identity、权限或用户可见行为变化。
