## Why

当前 Task Verification 把 Project 测试能力声明、分层执行、Candidate identity、临时 execution evidence 与 Finish 推进判断混在同一套 v2 authority 中，却没有 Task-scoped、可 Git 跟踪的 current Verification Result。P0.4 需要先建立这一事实层，供后续 Task Development/Candidate 与 Finish 读取，同时避免提前实现 P0.5 的推进权。

## What Changes

- **BREAKING**：将 Project `verification.yml` 收敛为 `buildr.project-verification/v2`，只声明已有能力的 identity、Project/Service scope、invocation、applicability、proves、`requiredForDelivery` 以及确有需要的环境、副作用和资源边界。
- **BREAKING**：将 `buildr.task-verification/v2` 替换为 v3；删除 `minimal/affected/candidate`、成熟度晋级、`requiredAssurance`、Candidate generation、重试和 proceed/blocked 等 lifecycle authority。
- 新增一个 Task Verification Application，独占 `.buildr/tasks/<task-id>/verification.yml` 的读取与原子整值替换；Result 绑定明确 target identity 与 declaration identity，并在任一变化后派生为 stale。
- 保留完整命令输出、耗时、资源等待和诊断为 transient Execution Evidence；portable Result 只保存验证目标、使用的声明、实际执行能力、事实结果、coverage gaps 与整体结论。
- 将 CLI、默认 Skill、Local App Task 投影与临时 Finish consumer 迁移到同一 Result authority；执行中断、完整失败结果形成前或写入失败不得覆盖 current。
- 删除已失效的旧 schema、contract、Skill 说明、文档、fixtures 与重复 consumer 判断；保留被真实产品测试使用的执行器、进程清理、资源协调和内部测试计划调度。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `task-verification`: 建立 Task-scoped current Verification Result、唯一 Application writer/reader 与 applicability 规则。
- `project-test-capabilities`: 将 Project 验证能力声明收窄为 v2，并删除旧分层、成熟度与声明级 DAG policy。
- `agent-task-workflows`: 迁移 Task Verification Skill/contract、CLI 与跨专业职责边界。
- `task-finish-execution`: 临时 Finish adapter 改为读取或补齐同一 current Result，不再消费独立 assurance summary。
- `local-workspace-application`: 在 Task 详情中只读投影 current Verification Result，并生成 Agent action prompt。
- `cli-product-surface`: 将验证执行入口改为显式 capability execution，并新增 Task Result inspect/record。
- `public-json-contracts`: 登记 Verification Execution 与 Task Verification Result operation 的公开 JSON family。
- `buildr-package-assets`: 原子投射 v3 capability contract、Skill、v2 declaration reference/template 与 runtime bindings。
- `npm-cli-package`: 确保安装包与 checkout CLI 共用同一 execution/Result Application。
- `concurrent-task-acceptance`: 组合验收改用显式 capability execution 和 current Result authority。
- `product-verification-quality`: 区分 Buildr 产品内部测试计划与 Project declaration/Task Result 语义。

## Impact

- Product governance：canonical specs、current knowledge、Roadmap 与 Verification 文档。
- Product runtime：Project declaration diagnostics、verification executor、Task Verification domain/repository/Application/CLI、Finish adapter、Local App 与 JSON schema registry。
- Runtime assets：`task-verification` v3 contract、Skill、reference/template、manifest/binding 与同步投影。
- Tests：Project declaration、executor/evidence/resource、Result atomicity/applicability/unique writer、CLI、Local App、Finish、package/runtime parity 与 legacy authority absence。
