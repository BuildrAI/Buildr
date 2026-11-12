# 历史 unknown 执行的列表收敛与可见状态

## Why

已完成且已查看的对话会被保留的历史 unknown 执行无限期钉在列表“活动中”排序档（高于有草稿的对话），列表却不显示任何状态标识，用户无法理解也无法处置。真实案例：对话 `6ff0770e-85ac-8433-aa8a-6561a752d84a` 当前轮 `completed`，保留轮带两个 unknown 工具且属主服务代进程仍存活；资源释放对账只在属主代退出后触发，跨代 stop/observe 转发只覆盖 `supersededBy` 轮次，因此该状态永不收敛。unknown 作为执行层的诚实证据必须保留，但它缺可见表示与收敛出口，属于当前产品缺口。

## What Changes

- 列表状态可见：仅因保留历史 unknown 执行而保持活跃、且没有其他可解释状态（执行中、待决策、待查看、待发送）的对话，列表活动状态 MUST 归为“状态待确认”（`unknown`），进入既有待确认计数与筛选，不再无声占据活动档。
- 新增保留轮“结束提醒”结算操作：用户可对满足安全条件的保留 unknown 执行显式确认结束提醒；结算只解除该轮对列表活跃与置顶的影响，不宣称完成、不终止任何进程、不重发操作，unknown 证据与诊断原样保留。
- 活动判定一致性：摘要、已读与历史列表查询对“已结算保留轮”按同一规则解释；真实在途工作（`executionState=active` 或 running 工具）、未读与有效问题仍 MUST 保持可发现。
- 前端保留执行卡片提供“结束提醒”入口及后果说明；列表对残余活跃行显示既有“状态待确认”标识。

无破坏性变更：新增操作与可选运行字段向后兼容；既有排序档位定义不变，仅把原先无声的活跃行归入既有“状态待确认”分类。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `agent-conversations`: 历史 unknown 保持活跃时的可见状态要求；保留 unknown 执行的用户结算操作及其安全边界；摘要/已读/列表的一致解释扩展到已结算保留轮。

## Impact

- `services/buildr-agent`：`domain/conversation-activity.ts`（活动判定）、`persistence/conversation-repository.ts`（列表状态与计数）、`application/conversation-application.ts`（结算操作）、`contracts.ts` 与 `operation-schemas.ts`（运行字段与操作契约）、HTTP/CLI 操作入口。
- `services/buildr-web`：`features/agent-conversations` 的活动状态推导、保留执行卡片与 API 客户端。
- 规范：`openspec/specs/agent-conversations/spec.md` 对应 Requirement 增补。
- 不影响执行层 unknown 的产生语义、资源释放证据链与既有跨代控制通道。
