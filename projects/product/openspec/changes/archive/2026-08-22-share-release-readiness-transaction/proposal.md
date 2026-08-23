## Why

Release selection、Product Candidate artifact 与 Task correlation 已分别提供稳定 read model，但当前发布入口仍在不同阶段自行拼装 context，旧 runner 也没有一个 collect-all、无副作用的 Readiness Result 供 pre-candidate、pre-main、dispatch check 与 hosted transaction 共同消费。现在需要把这些同源事实收敛成唯一 context digest，并让正式 workflow 在一次受保护审批中以同一 digest、Candidate evidence 和冻结 tarball 完成发布及恢复。

## What Changes

- 增加共享 release context builder：一次收集 selection、release HEAD/tree、Candidate、artifact、main/dev、Task correlation、Environment、exact Node 与 workflow identity，形成稳定 context digest。
- 增加分阶段 Readiness evaluator：`pre-candidate`、`pre-main`、`dispatch-check` 与 `pre-tag` 使用同一 closed context，collect-all 返回结构化 findings、hosted deferred checks、next actions 和恒定 `effects: []`。
- 将本地 release transaction runner 收窄为只读准备与显式 dispatch adapter；未取得维护者 publication 授权时不得 dispatch workflow，且本地永不模拟 OIDC、创建 tag 或执行 npm/GitHub mutation。
- 让唯一 `publish.yml` 在一次 `npm-production` approval 内消费同一 context digest、matching Candidate evidence 与冻结 tarball，完成 hosted OIDC、final pre-tag convergence、tag ensure、npm publish/dist-tag、GitHub Release 与 Registry readback。
- 为 current workflow run/attempt 形成 terminal transaction evidence；失败时保留已经成立的 tag、npm、dist-tag、GitHub Release 和 readback 事实，并区分同 attempt 可恢复与必须明确启动新 attempt 的恢复路径。
- 不新增 Task Record 状态、SQLite slot、第二 workflow、第二份 tarball或本地发布凭证路径；不实现 release→main、main→dev 或 branch cleanup。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `release-collection-model`: 增加共享 release context、分阶段 Readiness Result、currentness 与 collect-all 输出契约。
- `open-source-release-governance`: 要求显式授权的唯一 protected workflow 消费同一 context digest，并保留 current attempt 的不可逆发布事实与恢复语义。
- `product-verification-quality`: 约束 Readiness 和 protected transaction 复用 matching Candidate evidence 与唯一冻结 tarball，不重跑完整 Candidate或重新 pack。
- `agent-task-workflows`: 让 `buildr-release` 先执行无副作用 readiness，只有维护者明确授权后才能 dispatch 唯一 publish workflow。

## Impact

- 发布工具：`services/buildr/tools/release/` 的 context builder、readiness evaluator、transaction runner 与 terminal evidence。
- 正式工作流：`.github/workflows/publish.yml` 的 context/artifact输入、唯一 protected job、attempt evidence 与恢复检查。
- 维护者入口：workspace source `skills/buildr-release/SKILL.md` 和 `services/buildr/docs/release-checklist.md` 的 readiness/dispatch/recovery说明。
- 测试：release工具单元/集成测试、workflow静态契约与 package assets 投射一致性。
- 无前端、HTTP、Task schema、SQLite migration、第二 composition root或新的公开发布副作用入口。
