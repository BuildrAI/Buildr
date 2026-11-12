# 设计：历史 unknown 执行的列表收敛与可见状态

## Context

- 活动判定 `conversationActive`（`domain/conversation-activity.ts`）对保留轮的历史 unknown 证据要求“没有 running/unknown 工具或已记录资源释放”才豁免；列表 SQL（`querySummaries`）通过 `buildr_conversation_active` 对候选行按完整头重算，`list_active=1` 进入排序档 2。
- 资源释放对账 `reconcileReleasedControls` 只处理属主代已退出的运行；跨代 `controlSupersededRun` 只覆盖 `supersededBy` 轮次。属主进程存活时，unknown 工具的结果在物理上不可取得，没有任何收敛路径。
- 前端 `activityState` 只看当前轮与待决策/未读，对“仅因保留 unknown 轮而活跃”的行返回 `null`；`ConversationActivityStatus` 已有 `unknown` → “状态待确认”标识，`ConversationRetainedWork` 已展示保留轮并提供重新读取/停止。
- 规范 `agent-conversations` 已有“历史已释放未知不得单独保持对话活跃”Requirement 与列表活动区排序承诺（状态待确认属于活动区）。

## Goals / Non-Goals

**Goals:**
- 仅因保留 unknown 轮而活跃的对话在列表可见、可解释（状态待确认）。
- 用户可对保留 unknown 轮显式“结束提醒”，使对话回到普通历史排序；安全不变量不破。
- 摘要、已读、列表一致解释已结算保留轮；旧派生摘要无需用户新消息即按同一规则解释。

**Non-Goals:**
- 不改执行层 unknown 的产生与证据语义；不终止进程、不释放资源、不重发操作。
- 不处理当前轮 unknown（已有停止/观察/关闭对话入口）；不处理残留旧服务进程的清理策略。
- 不新增跨代 RPC，不改既有排序档位定义。

## Decisions

1. **残余状态规则（可见性）**：列表状态推导在既有分支之后增加兜底——`list_active=1` 且没有任何可解释状态（send-*、waiting、unknown 当前轮、running、unseen）时，`activity_state='unknown'`。前端 `activityState` 同样在既有判断后对 `activity.active` 的残余行返回 `'unknown'`。
   - 理由：紧凑摘要的 `retainedRuns` 省略 tools，SQL 无法直接识别“unknown 工具保持活跃”；残余规则不依赖完整历史，天然覆盖旧摘要与未来同类情形。
   - 备选（弃用）：在 SQL 中展开保留轮工具证据——需要放弃覆盖索引或改摘要结构，成本与风险更高。
   - 效果：此类行从排序档 2 进入档 3（待确认属活动区既有优先语义），计入 unknown/attention 计数；可见且可处置，而不是无声置顶。
2. **结算是人的判断，不是自动证明**：新增操作 `conversations.settleRetainedRun`，输入沿用控制身份（`expectedRevision`、`runId`、`participantId`、`generation`）。前置条件：目标在 `retainedRuns`、`!supersededBy`、`status='unknown'`、该轮无有效请求、`executionState!=='active'`、无 running 工具。效果：运行记录写入可选字段 `attentionSettled=true` 并更新 `updatedAt`；status、tools、diagnostic、accepted、stopRequested 等证据不变。幂等：已结算再次调用返回当前视图。
   - 理由：属主存活时 unknown 工具结果不可取得，自动对账无法产生结束证据；只有人能对“不再提醒”负责。前置条件排除真实在途工作，结算文案明示“不终止可能仍在运行的进程、结果仍未知、不会重发”。
   - 备选（弃用）：向活属主转发 observe——无法产生缺失的工具结果，不能收敛本案；超时自动结算——违反“不隐藏 live owner、证据不失真”。
3. **活动判定豁免已结算轮**：`conversationActive` 的保留轮分支对 `attentionSettled` 且 `executionState!=='active'` 且无 running 工具的运行不再保持活跃；`pendingDecisionCount`、`hiddenReleasedOutcome` 语义不变。列表 SQL 经既有 `buildr_conversation_active` 兼容路径自动一致，无需新索引。
4. **释放与结算相互独立**：结算不写 `resourcesReleased`；属主代退出后既有对账仍可记录真实释放。结算后再出现真实在途证据（active/running）时仍保持活跃。
5. **UI**：保留轮在实际界面中以历史轮次的“本轮结果待核对”注记呈现（`ConversationRetainedWork` 组件当前未挂载）。结算入口加在该注记处：满足条件时显示“结束提醒”按钮与后果说明，结算后注记改为“本轮提醒已结束；原执行结果仍未知”。列表复用既有“状态待确认”标识，不新增视觉体系。

## Risks / Trade-offs

- 待确认计数上升：原先无声的活跃行现在计入 unknown/attention——这是把既有事实显式化，属预期收益；用户可结算后回落。
- 用户可能在独立进程仍存活时结算：前置条件已排除 active/running 证据；结算不终止进程、保留全部证据与诊断，后续读取仍可观察真实状态。
- 排序档位变化（2→3）影响既有列表位置：仅影响本就异常置顶的行；规范同步增补，分页游标按既有 epoch 机制失效刷新。
- 兼容：`attentionSettled` 为可选字段，旧记录、旧摘要不受影响；操作契约按闭合 schema 增补，旧客户端不调用即无行为变化。
