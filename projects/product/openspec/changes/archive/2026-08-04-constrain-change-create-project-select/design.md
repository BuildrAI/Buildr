## Context

「创建变更」Agent Action 已改为从 `/api/v1/projects` 填充下拉框，但产品约束未写入 OpenSpec，且 `await` 之后通过全局 `document.getElementById` 回写并在最后 `bindForm`，抽屉切换时会污染其他同 id 表单。

## Goals / Non-Goals

**Goals:**
- 用 OpenSpec 固化：只能选择已登记 Project、上下文默认选中、无项目空态禁止生成
- 让异步项目加载对过期渲染安全：捕获本次 form/select/errorBox，先绑定事件，返回后校验仍连接且仍是当前表单
- 用浏览器集成覆盖竞态与无项目空态

**Non-Goals:**
- 不改 Change prompt HTTP API 或服务端校验语义
- 不在本 change 中系统性重构「接入服务」「开始工作」的同类异步模式
- 不恢复已删除的临时设计文档

## Decisions

1. **过期响应判定**：在渲染后立即捕获本次 `form`、`select`、`errorBox` 引用，并在 `await` 前 `bindForm`；响应返回后若 `!form.isConnected` 或当前 `#agent-action-form` 不是该 `form`，则忽略填充与错误展示。
2. **空态**：无项目时保留 `required` 的空 `option`（文案「请先创建项目」），依赖原生表单校验阻止提交。
3. **测试分层**：正常加载/默认选中与无项目空态保留现有 browser change smoke；新增 route 拦截覆盖延迟返回竞态。

## Risks / Trade-offs

- [Risk] 仅修复「创建变更」路径，服务/开始工作仍有同类竞态 → 本 change 明确非目标，避免扩大审查范围。
- [Risk] 先绑定 submit 时用户可在列表加载完成前提交空项目 → `required` + 空 option value 会阻止。
