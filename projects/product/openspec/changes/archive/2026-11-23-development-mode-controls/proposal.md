## Why

宽屏上居中的模式入口与左侧导航脱节；工作台中的对话移位菜单不移动当前布局，却会改变工作空间中的停靠偏好。

## What Changes

- 顶栏左侧依次为品牌、模式切换、空间选择；右侧产品操作不变。
- 仅在工作空间的横向分栏提供对话栏移位，采用明确的左侧、右侧文案。

## Capabilities

### Modified Capabilities

- `harness-web-composition`：统一顶栏的入口顺序和对话栏移位条件。

## Impact

只改变 Development 顶栏和菜单，不迁移数据、不改变停靠偏好格式或其他入口。[任务说明](@task/development-mode-controls)
