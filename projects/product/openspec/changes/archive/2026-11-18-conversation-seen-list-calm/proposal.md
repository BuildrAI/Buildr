## Why

当前在专注分屏模式下（对话列表与正文输入区并排展示），用户点击左侧带有“待查看”状态的对话进入查看后，正文确认已读（`POST /seen`）会立即触发列表刷新并按普通历史规则重排；由于许多“待查看”对话原本是比较早发起的任务，重排会让当前正在浏览的选中行瞬间向下跳动甚至掉出默认展示的前 5 条，邻行也跟着上顶，同时还会附带触发顶部统计请求，破坏阅读连续性与视觉定位。

为了让并排查看“待查看”对话的体验与“有草稿”交互一致并符合直觉，需要在查看最新消息后立即保存已读状态、更新侧栏“待处理/待查看”计数并隐藏左侧该行的“待查看”标签，同时在停留于当前对话期间锁定列表行位不重排；等用户离开该对话（切换到其他对话、新建对话或退出并排列表）后再刷新重排。

本变更不包含破坏性变更，不改动后端数据模型或接口契约。

## What Changes

- 扩展对话列表排序规范：明确分屏并排查看“待查看”对话时，确认看到最新可见消息后 MUST 立即持久化查看位置、更新全局待查看计数并隐藏该行“待查看”提示，同时在停留于该对话期间保持其列表行席位不变，待离开当前对话后再刷新重排；若停留期间停留在旧消息未看到最新回复，仍保留“待查看”不提前隐藏；若停留期间直接发送新消息或出现待决策等新活动状态，立即解除锁位并按新活动状态更新。
- 在 `buildr-harness-web` 中新增纯逻辑模块记录已确认的服务端 `seen` 活动状态并管理分屏查看锁位，由列表项叠加实时已读状态隐藏“待查看”，由工作空间分组在停留期间保序与抑制无关刷新、离开后释放重排，同时让列表顶部执行统计只跟随真实执行态变化。

## Capabilities

### New Capabilities

### Modified Capabilities
- `agent-conversations`: 补充并排查看“待查看”对话时先隐藏“待查看”标签与更新全局计数、停留期间锁定行位并在离开后刷新重排的交互约束。

## Impact

- 规范：`projects/product/openspec/specs/agent-conversations/spec.md`
- 前端实现：`projects/product/services/buildr-harness-web/src/features/agent-conversations/`
- 测试：`projects/product/services/buildr-harness-web/test/ui/` 与 `projects/product/services/buildr-harness-web/test/browser/focus-split-seen.test.ts`
