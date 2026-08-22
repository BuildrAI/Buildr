## Why

当前发布契约仍以“最新 `dev` 直接收敛到 `main`”为主线，无法表达维护者只选择部分已交付 `dev` commit 构成某个版本，也使 Candidate、唯一 tarball、Task/Finish/self-bootstrap 证据和发布后 `main → dev` 收敛缺少共同身份链。现在需要先建立 release 集合与模块所有权契约，才能让后续实现 Child 在不复制既有验证能力、不跨模块写专业事实的前提下并行开发。

## What Changes

- **BREAKING**：维护者发布准备从“冻结最新 `origin/dev` 并创建 `dev → main` Candidate PR”改为“从维护者指定的精确 `dev` baseline 创建 `release-<version>`，后续仅纳入维护者明确选择且带 `-x` provenance 的 `dev` commit”。
- 定义 release branch 的 create、update、freeze、abandon、cleanup 授权、幂等、冲突隔离和恢复语义；release 不自动追随 `dev`，冲突不得自动解决或产生远端副作用。
- 定义 `dev baseline → selection chain → release HEAD/tree → Candidate generation → frozen tarball → main → post-publish dev convergence → transaction evidence` 的唯一身份链和失效规则。
- 将 Product Candidate 改为绑定 current release HEAD/tree；同一 release 内容 SHA 只有一个 matching Candidate generation和一个冻结 tarball，正式 publish 只消费 matching evidence，不重跑完整 Candidate或生成第二份可发布 bytes。
- 明确 release/support Tasks、Environment、Development handoff、Finish Delivery、self-bootstrap Activation、Candidate 与 publication 只通过各 owner 的 current read model 关联；Delivery、Activation、Environment Cleanup、Diagnostics 和 Publication 保持正交。
- 建立 `tools/release`、`system/installation`、`verification`、`task`、self-bootstrap runner、Bootstrap 与 `publish.yml` 的 owner/consumer 矩阵，禁止跨模块 persistence 写入、第二 composition root 和旁路事实 store。
- 将 Hosted Windows、Host Node、Launcher、exact Node/PATH、primary evidence owner、affected/full、bounded scheduling、heartbeat/checkpoint 与 timing 明确为已交付复用基线；本 Change 只增加 release 模型差量契约。
- 同步 Brief、current knowledge、canonical terminology、`buildr-release` source Skill 与 release checklist；这些资产解释 canonical specs，不形成第二套发布规范。

## Capabilities

### New Capabilities

- `release-collection-model`: 定义 `release-<version>` 发布集合、选择 provenance、生命周期、身份链、模块所有权和失败隔离的唯一产品契约。

### Modified Capabilities

- `open-source-release-governance`: 将正式发布 source、release→main 收敛、受保护 publication 与发布后 main→dev 收敛绑定到 current release 集合和 matching transaction context。
- `product-verification-quality`: 将完整 Product Candidate 与唯一 tarball 从 `dev → main` source 改为 current release HEAD/tree，同时保留既有验证 owner 与去重不变量。
- `agent-task-workflows`: 调整发布准备、授权、Task Environment、Finish 与发布分支工作流，移除“最新 dev 自动成为发布集合”的旧前提。
- `task-finish-execution`: 约束 release/support Task correlation 只消费 current Finish read model，并保持 Delivery 与后续 Activation、Cleanup、Diagnostics、Publication 正交。
- `task-closeout-orchestration`: 约束 self-bootstrap 只拥有 matching retained activation/diagnostics，向 release correlation 提供稳定 readback且不得被 publication 反向改写。

## Impact

- 规范与知识：`openspec/specs/*`、`openspec/knowledge/flows/open-source-release.md`、`openspec/knowledge/services/buildr.md`、`openspec/knowledge/glossary.md`。
- 维护者入口：workspace source `skills/buildr-release/SKILL.md` 与 `services/buildr/docs/release-checklist.md`。
- 架构边界：`services/buildr/tools/release`、`services/buildr/src/system/installation`、`services/buildr/src/verification`、`services/buildr/src/task`、self-bootstrap runner、Bootstrap 与 `.github/workflows/publish.yml` 的 owner/consumer 关系。
- 本 Change 不实现 selection CLI、Candidate workflow、Task evidence adapter、readiness transaction runner、Git 收敛或 publish mutation；这些由依赖本契约的独立 Child 实现。
