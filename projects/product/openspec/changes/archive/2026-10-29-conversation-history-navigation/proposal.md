## Why

工作空间顺序当前随最新指令跳动，整组展开与全局分页又使用不同规则，无法稳定定位或控制长列表。应稳定工作空间位置并统一按组分批读取，同时让账号配置入口始终容易找到。

## What Changes

- 固定工作空间顺序，复用已保存拖动偏好；新工作空间使用稳定次序，不随对话活动变化。保留组内活动状态及最近指令排序。
- 每组默认显示 5 条，每次增加 10 条，可收起回 5 条，不再整组展开全部。
- 删除全局“加载更多”按钮，通过每组展开独立有界续读，不遗漏其他空间或旧对话。
- 将账号与配置移至对话侧栏，紧邻对话列表入口，配置内容与权限不变。
- 不涉及破坏性接口变更；沿用现有列表接口和偏好数据。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-conversations`：补充稳定空间排序、统一分批展开及侧栏配置入口约束。

## Impact

相关来源为 `ConversationHistory.tsx`、`conversation-history-groups.ts`、`ConversationDockSurface.tsx` 与 `ConversationDock.tsx`，以及所属功能的读取状态与测试。复用现有 `listAll` 的工作空间筛选、条数与续读位置，不修改服务端排序和存储。普通列表偏好仅作用于呈现，不作为账号授权或执行依据。现有地图职责仍成立；`knowledge/docs/architecture/agent-integration.md` 的分页与配置入口描述受影响，待取得知识维护授权后校准，不扩展为新图或术语建设。
