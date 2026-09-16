## Why

副分屏主要用于阅读文档，当前默认优先保留主屏宽度，用户需要再次拖动才能获得均衡阅读空间。现按用户确认，让默认布局直接左右各半。

## What Changes

- 无已保存手动比例时，副分屏与主屏均分可用信息宽度（扣除分隔线）。
- 保留手动拖动、工作空间（Workspace）比例记忆以及关闭副分屏后主屏恢复全部宽度。
- 不修改已保存偏好；不新增接口、依赖或数据迁移，无破坏性兼容变化。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `buildr-web-client`: 将副分屏默认宽度由保留主屏留白策略改为左右均分。

## Impact

影响前端 `workspace-pages.ts` 的宽度计算、相关单元和浏览器测试、`knowledge/docs/services/buildr-web.md`。主屏内容限宽规则与既有手机上下排列布局保持；已有智能体（Agent）操作入口不变。
