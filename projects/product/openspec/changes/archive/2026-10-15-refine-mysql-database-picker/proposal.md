## Why

MySQL 查询的“启用数据库”浮层把列表、说明和操作放在同一滚动区域，库较多时查找与确认不便；用户点击别处关闭还会丢失选择。本次优化该局部布局，并在用户关闭时自动保存有变化的选择，减少一次确认操作。

## What Changes

- 固定标题与已选数量，增加名称搜索，让数据库列表独立滚动，底部持续显示关闭后自动保存的说明。
- 移除“应用”按钮；用户点击浮层外或再次点击设置关闭时，仅对实际变化保存一次。
- 页面停用、刷新、失去写入资格或连接版本变化时丢弃未提交草稿，保持既有失败提示与偏好版本校验。
- 不包含破坏性变更，不改变数据库权限、查询行为、连接配置或本机偏好存储格式。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `mysql-query`：明确启用数据库浮层的布局、搜索与关闭保存行为。

## Impact

- 前端范围：`projects/product/services/buildr-web/src/features/mysql-query/components/DatabaseResources.tsx`、调用方与局部样式。
- 验证范围：浮层交互逻辑、既有偏好保存检查及离线浏览器夹具。
- 复用既有查询偏好接口与后端版本冲突保护，无新依赖、外部系统操作或数据迁移。
- 任务说明见[任务说明](@task/mysql-database-picker)。
