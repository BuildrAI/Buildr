# Change：增加 retained Finish 受控自修复

## Why

Buildr 自举时，retained Task Finish 的 Product phase provider 若在 `preflight` 或 `prepare` 自身发生确定性执行缺陷，修复该缺陷的候选内容仍无法通过同一个旧 provider 完成交付。现有 retained writer 边界是正确的，因此需要一个受控的 provider 替换入口，而不是让 candidate CLI、临时 npm 安装或任意模块路径取得 canonical Workspace 写入权。

## What Changes

- 为已有 Task Finish run 增加显式 `--bootstrap-recovery` 选项，只接受状态机明确记录为 `product-phase-provider` 来源、停止于 `preflight` 或 `prepare` 且尚无交付副作用的失败。
- 保持 retained Task Finish Application、Workspace SQLite repository、Execution Record、五阶段状态机与 Task Environment cleanup 为唯一 canonical owner。
- 在 Execution Record open gate 成功后，由 retained Application 从 current、clean、committed 且与冻结 Development handoff、Candidate/generation、Content Target 和 Environment Receipt 一致的 checkout 创建唯一 run-owned capsule。
- 只从 capsule 导入 Task Finish Product phase-provider 模块及其受验证的本地依赖闭包；不执行 candidate CLI，不接受 caller 指定的 source、module、manifest 或 tarball，也不使用 `npm pack` 或临时 npm 安装。
- 同一 run 的后续 blocked resume 复用同一 capsule 与 Product resume token；failed phase 只在封闭无副作用条件下于原 run 内重置，不创建新 Candidate、Verification、Review、handoff 或递归修复 Task。
- cleanup phase 持久化完成后，由 retained finalizer 原子撤销 capsule source authority、保存可恢复的撤销事实，再提交 terminal SQLite state；中途失败继续使用同一 run，不重放已通过阶段。
- 在 Finish Result 和 Execution Record 中追加最小 bootstrap provenance、原 failure、source/capsule identity 与 cleanup 结果。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-finish-execution`：增加 retained-writer phase-provider bootstrap recovery、同一 run 恢复与 crash-safe capsule cleanup。
- `cli-product-surface`：为已有 `task finish run` 增加显式且封闭的 `--bootstrap-recovery` 参数。
- `product-agent-skills`：要求 Agent 在调用前展示资格事实、限制和影响，并取得单独明确授权。

## Impact

- 影响 Task Finish Application、run executor、bootstrap recovery helper、CLI help、Result projection、Task Finish Skill/contract、测试和当前产品文档。
- 不新增数据库 migration、第二状态表、公共 adapter registry、持久队列、candidate canonical writer、npm 临时安装或 PATH 变更。
- CLI entry、registry、Task Finish Application、repository、migration 或 Structured Store 自身损坏不在恢复范围。
