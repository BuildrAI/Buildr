## Why

通用变更（Change）的文件、列表、详情及归档读取目前放在 `task/change/`，与已有 `openspec/` 职责分散。用户已确认将内容读取归回 OpenSpec，任务侧只保留关联与工作树（Worktree）选择。本次不包含破坏性变更。

## What Changes

- OpenSpec 统一拥有变更内容查询、归档定位、标准产物与界面原型（UI Prototype）文件读取，以及通用操作提示词生成。
- 任务侧保留任务关联、候选与保留副本选择、来源信息以及任务页面的组合展示。
- 保持 HTTP 路由、返回内容、错误、安全检查和全局仅保留副本索引行为不变，更新相关代码地图。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `cli-modular-architecture`：明确 OpenSpec 内容查询与任务关联组合的唯一职责边界。

## Impact

影响 `services/buildr/src/modules/openspec/`、`services/buildr/src/modules/task/change/`、相关装配与测试，以及 `knowledge/code-map/`。不改变持久数据、依赖、构建入口或前端源码。
