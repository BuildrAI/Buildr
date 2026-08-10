## Why

「收尾」入口在创建 Finish run 前对 Environment、Development handoff、交付 target/remote 等做顺序 fail-fast，Agent 一次只能看到第一项缺口；真实痛点是反馈晚、分类笼统，而不是缺少检查器。现有各模块 authority 已足够，需要的是入口一次聚合与按模块分类回报。

## What Changes

- Task Finish **run 创建入口**改为：复用既有 Environment / Development / 交付解析检查，跑完当前可观察项后再失败返回，不再在第一项处中断。
- 缺口按模块分类：`development`（研发）、`environment`（环境）、`delivery`（交付）；有研发缺口时不创建 Finish run，并路由 `task-development`。
- CLI `--json` 错误回报携带分类后的缺口明细，而不是只有单一 code/message。
- **BREAKING**（对依赖「第一个失败即停」的自动化）：同一失败响应可能同时包含多个模块缺口；消费方不得假设只有一项。
- 明确不做：`clean commit` / `change archived` 等独立硬门禁；不另造检查器；不扩大 Finish 对 Change/Verification/Review store 的读取。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `task-finish-execution`: 将「一次聚合廉价门禁」从仅 run 内 preflight 扩展到创建 run 前的入口观察；要求按模块分类缺口，并在有研发缺口时禁止创建 run。
- `public-json-contracts`: `buildr.cli-error/v1` 在 Task Finish 入口聚合失败时 MUST 携带按模块分类的缺口 details。
- `agent-task-workflows`: Task Finish Skill 入口改为消费产品聚合分类结果，不得自行逐项停在第一处。

## Impact

- 代码：`task-finish-application` 入口、可选抽取的 entry readiness 观察、CLI `reportCliFailure`、`task-finish` Skill 文案与 package 同步。
- 测试：补「多入口缺口」负例（至少同时含环境+研发或研发+交付），断言一次返回全部分类缺口且未创建 run。
- 不改动 Environment / Development / Git 各自检查算法本体。
