# 实施清单

## 1. 活动判定与规格

- [x] 1.1 `conversation-active.ts`：已请求停止的历史保留轮在没有活动执行或运行中工具时不再单独保持活跃；保留未知工具、诊断和停止证据。
- [x] 1.2 更新 `agent-conversations` 规格，明确历史停止后的未知证据与当前交互控制边界。

## 2. 前端控制与恢复

- [x] 2.1 `conversation-stop.ts`：停止可用性只接受真实活动控制、运行中/可停止工具、活动状态或有效请求；已请求停止且非活动的 unknown 轮不再显示停止。
- [x] 2.2 `conversation-state.ts` 与 `ConversationPanel.tsx`：恢复判定使用实际可见条目和最终主答复，停止时冻结的最终答复也参与判断。

## 3. 测试与验证

- [x] 3.1 更新 buildr-agent 活动判定与 unknown settlement 集成测试。
- [x] 3.2 更新 buildr-web 停止控制与恢复提示测试。
- [x] 3.3 运行相关前端、Agent、静态检查与规格校验。
