# agent-conversations 增量

## MODIFIED Requirements

### Requirement: 历史已释放未知不得单独保持对话活跃
系统 MUST 在摘要、已读和历史列表查询中一致解释历史执行。当前执行已结束且历史未知执行没有明确 active 状态、也没有 running 或 unknown 工具时，历史未知本身 MUST NOT 保持对话活跃，无论其控制资源是否已记录释放。已被用户显式结算提醒（`attentionSettled`）的保留未知执行，在没有明确 active 状态且没有 running 工具时，同样 MUST NOT 单独保持对话活跃，无论 unknown 工具是否仍在记录中。未知执行和工具证据 MUST 保留，真实活动工作、未读和有效问题 MUST 继续可发现。旧派生摘要 MUST 按相同规则解释，不要求用户发送新消息。

#### Scenario: 旧摘要仍标活跃
- **WHEN** 历史未知没有在途工作但旧摘要仍为 active，当前已完成且所有消息已读
- **THEN** 列表 MUST 按普通历史对话处理，重开和标记已读不恢复错误活跃，原未知结果保持不变

#### Scenario: 历史存在真实在途工具
- **WHEN** 历史执行存在明确运行中或 unknown 工具，或 active 执行状态
- **THEN** 系统 MUST 保留活跃，不以缺少释放记录或旧摘要掩盖真实在途工作

#### Scenario: 未受理旧轮没有在途工作
- **WHEN** 旧轮 accepted=false、status=unknown、没有工具和执行引用，当前轮已完成且消息已读
- **THEN** 历史旧轮 MUST NOT 单独保持对话活跃；unknown 记录、诊断和送达未知事实 MUST 保留

#### Scenario: 未读和有效问题
- **WHEN** 当前执行已结束但存在未读消息或有效待回答问题
- **THEN** 对话 MUST 继续保持活跃并可发现

#### Scenario: 已结算保留轮不再置顶
- **WHEN** 保留未知执行已被用户结算提醒，没有 active 执行状态也没有 running 工具，当前轮已完成且消息已读
- **THEN** 该轮 MUST NOT 单独保持对话活跃，列表 MUST 按普通历史对话排序；unknown 状态、工具记录与诊断 MUST 原样保留

#### Scenario: 结算后出现真实在途证据
- **WHEN** 已结算保留轮随后被观察到明确 active 执行状态或 running 工具
- **THEN** 对话 MUST 恢复活跃并可发现，结算记录 MUST NOT 掩盖真实在途工作

## ADDED Requirements

### Requirement: 保留未知执行必须可见并可结束提醒
当前执行已结束、没有未读消息、有效问题或待发送输入，而对话仅因保留的历史未知执行保持活跃时，历史列表 MUST 将该对话的活动状态归为“状态待确认”（`unknown`），计入对应待确认计数与筛选，MUST NOT 以无状态形式占据活动排序档；摘要、已读与列表查询 MUST 一致解释。系统 MUST 提供针对保留未知执行的显式结算操作：校验调用方提供的准确控制身份与记录版本，且目标运行 MUST 位于保留轮、未被替代、状态为 `unknown`、该轮没有有效请求、执行状态不是 `active`、没有 running 工具。结算效果 MUST 限于记录结算事实（`attentionSettled`）与更新时间；MUST NOT 改变运行状态、工具记录、诊断、受理或停止事实，MUST NOT 终止任何进程、释放控制资源、宣称执行完成或重发原操作。重复结算 MUST 幂等。属主代退出后，既有资源释放对账 MUST 仍可记录真实释放，不受结算影响。前端保留执行的历史轮次展示 MUST 对满足结算条件的保留轮提供“结束提醒”入口，并说明后果：原执行结果仍未知、不终止可能仍在运行的进程、不会重发操作。

#### Scenario: 无声活跃行变为可见待确认
- **WHEN** 当前轮 completed、消息已读、无待决策与待发送，仅保留 unknown 轮（含 unknown 工具、属主代存活）使对话保持活跃
- **THEN** 列表 MUST 显示“状态待确认”并计入待确认计数，MUST NOT 无标识地排在有草稿的对话之前

#### Scenario: 用户结算保留轮
- **WHEN** 用户对满足前置条件的保留 unknown 执行提交准确控制身份并确认结束提醒
- **THEN** 系统 MUST 记录结算事实并返回当前视图；对话 MUST 回到普通历史排序，运行状态、工具与诊断 MUST 保持不变，不终止进程、不重发操作

#### Scenario: 不满足安全条件时拒绝结算
- **WHEN** 目标运行不是保留 unknown 轮、该轮仍有有效请求、执行状态为 active 或存在 running 工具，或控制身份与记录版本不匹配
- **THEN** 系统 MUST 拒绝结算并保留现场，不产生部分效果

#### Scenario: 重复结算
- **WHEN** 对已结算的保留轮再次提交结算
- **THEN** 系统 MUST 幂等返回当前视图，不重复改写证据或时间以外的记录
