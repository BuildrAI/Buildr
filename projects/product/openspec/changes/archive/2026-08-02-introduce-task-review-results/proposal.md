## Why

Buildr 目前只有通用 Change 审查提示和面向长期资产的 `task-asset-review`，没有一份绑定明确任务目标、可跨 Agent 恢复并由后续研发交接消费的 Task Review evidence。P0.3 需要先建立宽而薄的 Review Result 数据边界，让未来 Task Development 可以引用真实审查结果，同时不提前建设 Candidate、审查执行器或通用状态机。

## What Changes

- 新增一个 `task-review` capability、一个 Task Review Application 和一个同名 Skill。Skill 负责语义审查，Application 独占结果校验、读取与写入；不拆成 Planning/Completion 两个模块。
- 为每个正式 Task 提供 `planning` 与 `completion` 两个互不覆盖的可选 current 槽位，分别写入 `.buildr/tasks/<task-id>/reviews/planning.yml` 与 `completion.yml`。Task 创建不产生占位文件，也不因缺少任一结果自动失败。
- 两个槽位使用同一 closed `buildr.task-review-result/v1` schema，只保存 Task/Review 类型、opaque target identity、执行方式、实际覆盖、未覆盖项、findings、真实结论与完成时间。首版不保存 revision、Result history、Review Run、Agent session、finding lifecycle 或专业状态机。
- Application 只在一份完整 Review 正常结束并通过校验后原子替换对应 current 文件；中断、工具失败、结论不完整或写入失败都保留旧 bytes 与 sibling records。
- Result 只持久化 `targetIdentity`。reader 根据调用方提供的 current target identity 派生 `current / stale / unknown`，不把 applicability、`current: true` 或 policy/environment 状态写回文件；只有 identity 完全匹配的 Result 才能满足未来门禁。
- 公开最小 `buildr task review inspect|record <task-id>` CLI 与稳定 JSON response。CLI/Application 不执行审查、不生成 plan context 或 Candidate identity，只接收完整语义结果并返回两个槽位的 read model、`resultDigest`、适用性诊断和精确 effects。
- 在 Local App 的 Task 详情增加独立“审查”页签，查看两个槽位的缺失、current、stale 或 unknown 状态及完整轻量结果，并通过 Agent action 发起或重新执行对应 Review；页面不直接编辑 Result、不建设历史或 finding 工作流。
- **BREAKING**：正式 Task-scoped Change 详情中的“交给 Agent 审查”改为发起该 Task 的 Planning Review，不再形成绕过 Task Review Result 的第二条正式任务审查路线。Workspace 全局 Change 列表的只读通用审查提示保持不变。
- 保留 `task-asset-review` 的 observation/复盘 authority；它不迁移为 Task Review，也不写入 Review Result。删除或改写任何与新 Result authority 冲突的旧 route、store、schema fixture 和测试，不保留双 writer。
- 校准 lifecycle roadmap 中 Review Result `revision`、两类结果必填门禁和重复 current 引用表述；未来 Development handoff 只冻结所采用 Result 的 digest、target identity、执行方式与最小结论。

## Capabilities

### New Capabilities

- `task-review-results`: 定义一个 Task Review capability、两个可选 current Result 槽位、最小数据模型、target applicability、唯一 writer、安全替换与只读聚合。

### Modified Capabilities

- `agent-task-workflows`: 增加 `task-review` Skill 路由、执行边界和 Result evidence 交接，保持是否要求 Planning/Completion Review 由未来 Task Development 决定。
- `task-record`: 在不修改 Task Record schema/authority 的前提下，为 Local App Task 详情组合独立 Review read model 与 Agent action。
- `change-asset-indexing`: 将正式 Task-scoped Change 的审查 action 路由到 Planning Review，同时保持全局 Change collection retained-only 和普通 Change review 不变。
- `cli-product-surface`: 登记最小 Task Review `inspect|record` 命令并明确它们只管理完整 Result，不执行语义审查。
- `public-json-contracts`: 登记 Task Review operation response、两个可选槽位、response-only `resultDigest` 与派生 applicability。
- `buildr-package-assets`: 原子交付 Task Review Domain/Application/repository、Skill/capability binding、CLI/JSON、Local App/API、runtime assets 和冲突旧 route/test 清退。

## Impact

- 产品实现仍只修改 `projects/product/services/buildr/`，新增窄 Task Review Domain/Application/repository、CLI interface、Local App Task Review reader/API/Agent action 和专项测试。
- 随包 workspace 资产新增 `buildr.task-review/v1` contract、optional `task-review` Skill、manifest/binding/runtime mapping；`task-asset-review` 的 identity、store 和 Finish dependency 保持不变。
- canonical Workspace 新增可 Git 跟踪的 `.buildr/tasks/<task-id>/reviews/*.yml`；Task Record 与本机 `environment.json` schema 均不增加 Review 字段。
- P0.3 只证明完整 Result 的记录、读取、失效和 UI 投影；不实现 Task Development、Candidate generation、Review history、真实 Agent session proof、Task Verification 替代或 Task Finish 门禁。
