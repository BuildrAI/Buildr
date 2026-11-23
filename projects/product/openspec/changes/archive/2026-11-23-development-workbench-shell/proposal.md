## Why

Development 的全局操作目前只在工程区可见，界面另占一行切换工程区。明确区分日常对话与空间管理，不重做对话、项目或代码工具。[任务说明](@task/development-workbench-shell)

## What Changes

- 固定一条全宽顶栏：左保留空间选择器，中间切换工作台与工作空间，右保留既有全局操作。
- 工作台从对话标题打开右侧工作区，提供原有资源管理器和源代码管理；工作空间保留工程页面和侧边对话。
- 移除重复的旧模式入口。不新增对话变更卡。不改变业务数据、权限或深链接。

## Capabilities

### Modified Capabilities

- `harness-web-composition`: 两种布局、唯一对话和既有文件工具的同页装配。

## Impact

Development 网页及 Harness 的公开布局组件；没有数据迁移、新接口或独立 Harness 行为变化。顶栏和旧模式入口有意调整，原路由兼容。
