## Why

Buildr Development 专注模式和独立 Buildr Harness 已在设置图标上方拆出独立的“供应商额度”入口，而 Development 分屏模式（含展开态与收起态）仍将其合并在设置齿轮图标内，导致额度查看入口在两种模式间不一致。

## What Changes

- Development 普通分屏展开态在设置图标上方固定提供独立的“供应商额度”入口，悬停或键盘聚焦显示供应商额度摘要，点击直达设置抽屉的“模型 → 全部供应商 → 账号与额度”页签；齿轮图标不再触发额度摘要，仅负责打开设置抽屉。
- Development 分屏收起态侧边导轨同步在设置图标上方提供独立的“供应商额度”入口，点击后展开分屏并直接打开设置抽屉的“账号与额度”页签，不改变当前对话、草稿或执行。
- 根据当前停靠侧别调整额度摘要浮层的默认弹出方位，避免右停靠分屏下浮层向右超出视口。
- 同步更新 `harness-web-composition` 与 `model-usage-controls` 规范、架构文档及分屏集成浏览器端到端检查。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `harness-web-composition`: 将独立“供应商额度”入口与“齿轮不再触发额度摘要”的行为扩展至 Development 普通分屏展开态及收起态，分屏继续复用原有设置抽屉。
- `model-usage-controls`: 将右下角额度概览悬停/聚焦与点击直达“账号与额度”的触发入口统一为设置图标上方的独立供应商额度入口，同时保留收起态导轨的直达入口。

## Impact

- 前端实现：`services/buildr-harness-web`（`ConversationDock`、`ConversationDockSurface`、`AccountQuotaButton`、`HarnessConversationSurface`）与 `services/buildr-web`（`AgentConversationsContext`、`ConversationWorkspace`、`harness-ui.css`、`development-harness-shell.css`）。
- 文档与验证：`knowledge/docs/architecture/agent-integration.md` 与 `services/buildr/test/e2e/harness-frame.ts`。
- 无破坏性变更；不改变后端接口、额度读取逻辑、对话归属或工作空间登记。
