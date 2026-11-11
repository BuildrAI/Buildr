# 实施清单

## 1. buildr-agent 契约与领域判定

- [x] 1.1 `contracts.ts` 与 `operation-schemas.ts`：运行视图增加可选 `attentionSettled:boolean`；新增 `conversations.settleRetainedRun` 请求 schema（控制身份字段）与操作登记，响应为对话视图。
- [x] 1.2 `domain/conversation-activity.ts`：`conversationActive` 保留轮分支豁免 `attentionSettled` 且 `executionState!=='active'` 且无 running 工具的运行；`pendingDecisionCount`、`hiddenReleasedOutcome` 不变。

## 2. buildr-agent 应用与列表

- [x] 2.1 `application/conversation-application.ts`：实现 `settleRetainedRun`（控制身份与版本校验、前置条件校验、幂等、只写 `attentionSettled` 与 `updatedAt`、保存并发出既有视图事件）；经 `agent-service.ts` 门面与 `process/server.ts` 操作分发暴露。
- [x] 2.2 `persistence/conversation-repository.ts`：`querySummaries` 状态推导增加残余分支——`list_active=1` 且无其他可解释状态时 `activity_state='unknown'`；确认 unknown/attention 计数与筛选随之生效，分页游标按既有 epoch 机制处理。

## 3. buildr-web 呈现与入口

- [x] 3.1 `conversation-activity.ts`：`activityState` 对既有判断后仍 `activity.active` 的残余行返回 `'unknown'`（排除 `unacceptedStopSettled`）。
- [x] 3.2 API 客户端新增 `settleRetainedRun`；`ConversationPanel` 在保留轮历史轮次的“结果待核对”注记处对满足条件的保留 unknown 轮显示“结束提醒”按钮与后果说明（结果仍未知、不终止进程、不重发），结算后注记改为提醒已结束；版本冲突走既有刷新。

## 4. 测试

- [x] 4.1 buildr-agent：活动判定单元测试（已结算保留轮豁免、active/running 证据仍活跃、幂等）；列表集成测试（残余活跃行归为 unknown 并计数、结算后回普通历史排序、旧摘要一致解释）；结算操作集成测试（前置条件拒绝、证据不变、版本冲突）。
- [x] 4.2 buildr-web：`activityState` 残余分支与 `canSettleRetainedRun` 结算条件单元测试；按新契约更新既有提醒分组断言。

## 5. 当前认知维护（assess 结论）

- [x] 5.1 `knowledge/docs/architecture/agent-integration.md`：更新未知执行活动语义段落——仅因保留 unknown 保持活跃的对话列表归为“状态待确认”；新增用户结算语义（不终止进程、证据保留、与资源释放独立）。
- [x] 5.2 `knowledge/code-map/system-services-assets.md`：更新 `conversation-activity.ts` 职责描述，纳入已结算保留轮豁免与列表残余状态规则。

## 6. 验证

- [x] 6.1 运行 buildr-agent 与 buildr-web 的静态检查与单元测试（按服务真实入口），失败项修复后复跑；`openspec validate conversation-unknown-convergence --strict` 与 `buildr openspec convergence preflight` 通过。
