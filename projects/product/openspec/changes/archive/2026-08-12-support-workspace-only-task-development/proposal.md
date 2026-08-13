## Why

正式 Task、Task Environment 与 Content Target 已允许只包含 Workspace selector，但 Task Development policy 和 Task Verification Result 仍强制至少一份 Project declaration，导致没有 Project、Service 或 Project-bound Change 的正式 Task 永远无法形成 Candidate、Development handoff 与 Task Finish。该缺口还会让只填写 Service 或 Change 所属 Project、未冗余填写 `scope.projects` 的 Task 被错误视为空 declaration。

## What Changes

- 定义有效 Project 集合：显式 Project、Service 所属 Project 与 Change 所属 Project 的确定性并集；只有并集为空时才是仅工作区（workspace-only）Task。
- 仅工作区 Task 允许以空 Project declarations、非空 `workspace` coverage gap 和 `not-passed` Verification Result 形成稳定、可比较的 policy/Result identity；不得自动标记 passed。
- workspace coverage gap 尚未进入 current Result 时阻止 Candidate freeze；形成 current `not-passed` Result 后仍必须经过现有风险接受或明确 gate disposition，才能 `proceed` 和形成 handoff。
- Project、Service 或 Project-bound Change Task 继续要求非空 Project declarations，并对全部有效 Project 执行现有 capability、coverage 与 stale 检查。
- 保持 Development/Verification/Finish 的 Workspace SQLite 单一 authority、旧 Receipt/Result 兼容读取、Completion Review 与 Task Finish 五阶段门禁，不新增 store 或 Git Receipt。

本 Change 不包含破坏性变更；它只为此前无法完成正式生命周期的 Task 增加受约束语义，并修正有效 Project 推导。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-development`：允许真正的 workspace-only policy，以 `workspace` coverage gap、current Result 和现有风险/waiver 门禁推进 Candidate 与 handoff。
- `task-verification`：按有效 Project 集合观察 declarations，并为 workspace-only Task 条件式接受空 declarations 与类型化 workspace gap。
- `task-finish-execution`：明确消费 workspace-only Task 的 current Development handoff，保持既有五阶段交付和零 Formal Verification execution。

## Impact

- Contracts/Skills：`buildr.task-development/v2`、`buildr.task-verification/v3`、`buildr.task-review/v1`、`buildr.task-finish/v1` 的一致性说明与使用指引。
- Domain/Application：Task scope Project 推导、Development policy normalization/currentness、Verification Result normalization/coverage 校验。
- Persistence/read model：继续复用现有 SQLite current rows；repository 读取自描述 workspace shape 以保持 scope 变化后的 stale 派生，新写入才由 Application/repository 绑定 current Task scope，不迁移或回填历史事实。
- Tests：新增 domain、Application、repository、operation contract、CLI/System 与完整 Development → Finish 生命周期回归，并保留 Project-only、Service-scoped、多 Project 行为。
