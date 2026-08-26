## Context

当前 `task next` 已能组合 Task Record、Task Environment、Task Development、Parent 与 Finish 的只读事实，但没有把“是否适合启动 Candidate/Finish 重型路径”作为一个稳定的跨 owner 投影。Verification preparation admission 只负责 Environment/Preparation/Runtime 绑定，不能表达 OpenSpec Change、责任方路由、目标身份和已有执行记录之间的整体关系。

本设计必须遵守 Buildr Core：Agent 仍负责理解、选择修复或重跑策略；Buildr 只提供事实、明确边界和确定性安全阻断。准入结果不是新的持久状态、Result 或生命周期状态机。

## Goals / Non-Goals

**Goals:**

- 在现有 `task next` response-only 快照中提供可移植的四状态 `closeoutAdmission`。
- 以最小读取集合对账 Task、Change、Owner route、Environment、Development target、Execution Record 与 Finish/resource waiting。
- 为每个阻断或等待项返回 owner、稳定 code、便于 Agent 直接执行的 next action。
- 对确定性身份/完整性错误 fail closed；对 provider 不可用、等待共享资源和已有运行保持可诊断降级。

**Non-Goals:**

- 不新增 SQLite 表、Receipt、Result、Candidate、Finish 或 Execution Record writer。
- 不启动测试、取得资源、执行 Finish、自动重跑、自动跳过或修改 Task 状态。
- 不把全部 Project 验证 registry 复制进 Task Entry，也不替代正式 Verification、Completion Review 或 Finish owner。
- 不覆盖 Release 分支安全、发布树收敛或其他本轮优化。

## Decisions

### 1. 复用 `task next`，不建立第二套命令状态机

`closeoutAdmission` 作为 `task next` 的 response-only 字段返回；它与既有 `next`、`blockers`、`finish` 共用同一次只读观察。这样 Agent 仍使用现有入口，Buildr 不新增一条并行生命周期路由。

备选方案是新增独立 `task closeout admission` 命令。它能提供更窄的调用，但会产生第二个读取入口和重复 owner 组合逻辑；本轮不采用。

### 2. 四状态只表达行动分类，不写入生命周期

- `ready-for-finish`：确定性检查通过，允许 Agent继续选择 Candidate/Finish。
- `repair-before-finish`：确定性 authority、identity、Change 或 owner 完整性不满足，重型动作暂不应启动。
- `waiting-on-execution`：已有匹配 Execution Record、共享资源或 Environment 执行正在等待，优先读取同一 authority，不重复启动。
- `blocked-by-user-decision`：需要用户决定范围、授权、风险或其他不可由 Buildr推断的事项。

状态由当前事实派生，不保存、不累积、不作为下一个状态机输入。

### 3. 采用 owner facts，不复制专业正文

Change 只读取 scoped Change resolution 与 artifact availability；Owner 只读取当前 capability route/readiness；目标与 Finish 只读取 Development/Finish 的 compact facts；Execution Record 只读取 portable list/view；资源等待只读取已有 blocker/recovery 摘要。任何详细正文仍由原 owner读取。

### 4. 阻断边界与安全降级

只有能够证明继续执行会写错对象、使用 stale identity、绕过缺失 Change/Owner 或制造错误完成结论时，才返回 `repair-before-finish` 或 `blocked-by-user-decision`。provider 读取失败、信息暂不可用或资源尚未释放时，返回对应 owner 的 attention/`waiting-on-execution`，不伪造 `ready-for-finish`；无关开发和只读调查继续可用。

## Risks / Trade-offs

- [额外只读成本] 每次 `task next` 可能多读 Change/Execution Record → 只在 Task 已接近 Candidate/Finish 时读取，且复用同一 snapshot 的 owner 读取计时。
- [事实不完整] 某个 provider 无法读取时可能无法给出 ready → 明确返回 owner、code 和 next action，保持安全降级，不阻断无关动作。
- [状态误用] Agent 可能把 `ready-for-finish` 当作完成结论 → 公共契约明确它只是 proceed 建议，不生成 Candidate、Verification、Finish 或 Task terminal evidence。
- [旧 consumer 兼容] 现有 `task next` consumer 未识别新字段 → 新字段为可选 response-only 字段，既有 `status`、`next`、`blockers` 与 effects 语义保持不变。

## Migration Plan

先加入纯函数分类与 `task next` 投影，补充公共 JSON、集成和契约测试；再由 Candidate/Finish Agent 在重型动作前读取该字段。失败时删除该可选投影即可回退，不涉及数据迁移或历史 Result 重写。

## Open Questions

- 当前不把 Project 全量 changed-path owner registry 复制到 Task Entry；若后续需要更细粒度 Owner 对账，应由 Verification planner 暴露最小 portable admission fact，再由本投影消费。
