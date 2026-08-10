## Context

产品入口 Buildr Skill 的源正文已经使用 `<agent>` 占位符，但 renderer 会追加“当前 Agent Adapter”和 adapter-specific 命令。投射目标只证明 Buildr 向哪个 runtime root 写入文件；当另一个宿主也发现该 root 时，这段派生正文会把文件来源错误提升为宿主身份 authority。

## Goals / Non-Goals

**Goals:**

- 让所有 adapter 的产品入口 Buildr Skill 使用同一份精简、adapter-neutral 执行正文。
- 让普通当前环境操作只从宿主明确身份选择 adapter，并允许用户显式维护其他 runtime。
- 保留 registry、Doctor 和 receipt 中的 adapter-specific 投射与诊断事实。

**Non-Goals:**

- 不让 Buildr CLI 自动探测调用它的宿主进程。
- 不保存 Workspace 级默认 Agent，也不禁止一个 Agent 显式维护另一个 runtime。
- 不重命名 Doctor 兼容字段，不改变现有 CLI 参数。

## Decisions

1. 删除产品入口 Skill 的 `buildAdapterRuntimeContext()` 注入。仅改标题不足以消除固定命令对 Agent 的错误引导；adapter-neutral 正文同时避免共享 discovery root 的 last-writer 语义差异。
2. 身份边界写在产品 Skill 源正文中，保持短小：`<agent>` 来自宿主明确身份或用户明确目标；禁止从投射文件和 Doctor 投射字段推断；无法确认时停止。
3. adapter-specific `recommendedCommands` 继续由 `runtime list --json` 暴露，receipt/Doctor 继续保存投射事实。它们只在 adapter 已通过合法 authority 选定后消费。
4. 不新增 capability contract。产品入口 Skill 不是可替换 provider，本次没有跨 Skill 稳定依赖变化。

## Risks / Trade-offs

- [旧会话仍缓存错误正文] → 发布后按 adapter reload 或开启新会话；文件同步不冒充 session adoption。
- [失去就地复制的 adapter 专属命令] → Skill 先确认宿主，再从 `runtime list` 和 CLI help 读取对应命令，换取正确身份边界。
- [外部 Agent 仍可能读取多个同名 Skill] → 投射正文保持一致且无身份默认；同名 precedence 仍按现有 partial inventory 边界处理。

## Migration Plan

1. 发布新的 adapter-neutral 产品 Skill 与 renderer。
2. 各 Workspace 下次 `sync <actual-agent>` 或 `skill install <actual-agent>` 时覆盖受管旧投射。
3. Qoder 等需要显式刷新者执行 reload 或开启新会话。
4. 若回归失败，恢复旧 renderer 和 package contract；receipt 结构及 CLI 数据没有迁移。

## Open Questions

无。
