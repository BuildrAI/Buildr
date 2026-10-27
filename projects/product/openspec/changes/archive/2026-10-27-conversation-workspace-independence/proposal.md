## Why
工作空间列表页上的对话高度不稳定，且新对话强制选择工作空间并随页面变化，阻碍独立工作。

## What Changes
- 对话区域独立管理可用高度和滚动。
- 新对话允许选择、替换或取消工作空间，取消时使用固定 default 工作目录。
- 已创建对话的执行目录与工作空间保持不变。

## Capabilities
### New Capabilities
- `independent-conversation-workspace`: 独立对话的默认工作位置与选择边界。
### Modified Capabilities

## Impact
影响对话前端、宿主工作目录解析及应用级对话请求入口。不迁移历史记录，不改变工具授权。
