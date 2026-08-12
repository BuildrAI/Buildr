## Why

当前 Formal Task Finish 产品执行器已经能够一次完成固定五阶段，但 Agent 在调用前仍可能重复读取或猜测 contract，上层等待会产生多轮短轮询，Buildr 自举 Workspace 在 Finish 后还需手工编排 sync、精确 commit、push、安装、Doctor 与最终读回。最近一次复盘中，“收尾”共发生 17 次 Agent 工具调用，其中 Finish 后的机械编排占 10 次；这些往返增加了上下文与 Token 开销，也扩大了人工拼接命令时的出错面。

现在需要把已经稳定、确定性的收尾动作收敛为可验证的产品/Skill 边界，同时保持 Formal Finish 五阶段、Git Operation、Workspace sync、安装与 Doctor 各自的责任和失败事实，不新增持久化“执行胶囊”或第二套收尾状态机。

## What Changes

- 为 Task Finish Result 增加只读、可移植的 `resolvedContext` 摘要，明确本次实际采用的 Task Finish capability、Development handoff、Environment、Agent、target branch/remote 与 Workspace Node identity；这些值只投影已有权威事实，不成为新 writer 或调用方可编辑输入。
- 为 Buildr 自举 Workspace 提供确定性的 post-Finish closeout runner。Runner 从同一 run 的 current/terminal Finish Result 重新解析冻结输入，按固定阶段执行 plan、workspace sync、精确 Git commit/push、development CLI/Local App 安装及最终 Doctor或same-run resume，并返回结构化阶段结果。
- Runner 使用当前 Git、remote、安装和 Doctor 事实实现幂等恢复；例如本地 successor commit 已创建但 push 未完成时必须复用该 commit，不能重复生成提交或重放已经完成的远端效果。
- Runner 保持 sync、commit、push、安装、Doctor 与 Finish resume 的独立结果和失败边界；失败后停止后续不安全动作，不把多个 authority 合并成原子事务。
- Task Finish Skill 对长时间运行的 Finish 命令采用“启动后有界长等待至终态”的调用语义；普通输出不触发高频轮询，只有仍为 running、等待上限到期或需要输入时才继续等待。
- **BREAKING**：无。既有 `buildr.task-finish-result/v2` 仅增加 additive 字段；Formal Finish 仍只公开 `run|inspect`，固定五阶段和现有恢复 token 保持不变。

## Capabilities

### New Capabilities

- `task-closeout-orchestration`: 定义 Agent 调用 Formal Finish 的长等待语义，以及 Buildr 自举 Workspace 在 Finish 后以单一确定性 runner 完成结构化、幂等、可恢复的收尾编排。

### Modified Capabilities

- `task-finish-execution`: Task Finish Result 增加只读 `resolvedContext`，报告本次从既有权威事实解析出的最小执行上下文，同时禁止其成为持久化胶囊或调用方输入。

## Impact

- 受影响产品代码：Task Finish result/domain/serializer、CLI/system tests。
- 受影响 Workspace 能力：`buildr-self-bootstrap-sync` Skill、`buildr-self-bootstrap` Component contribution；确定性runner实现位于`product/buildr`内部driver，由该Workspace Skill作为唯一调用方。
- 受影响 package/runtime 投射：Task Finish Skill 与 contract 的 workspace package source；完成交付后需要按自举规则同步当前 Codex runtime。
- 不新增数据库表、Receipt、execution capsule、后台服务、通用任务队列或普通用户 Workspace 能力。
