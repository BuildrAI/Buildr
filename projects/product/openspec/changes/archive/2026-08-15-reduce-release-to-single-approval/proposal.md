## Why

当前正式发布把 hosted authority probe 与 npm publish 拆成两个独立的 `npm-production` deployment：维护者先批准手动 probe，本机再创建并推送 tag，tag push 又触发第二个受保护 publish job。两次审批来自架构上的两个 Environment deployment，并不能由已有“准备阶段不 probe”优化消除；需要把最终权威证明、pre-tag 门禁、tag 创建和 publish 收敛为同一个受保护发布事务。

## What Changes

- 将 `publish.yml` 改为由一次显式 `workflow_dispatch` 启动完整正式发布；可逆 contract、唯一 tarball 和跨平台 smoke 先运行，唯一受 `npm-production` 保护的 release transaction job 在一次审批后完成 OIDC probe、最终 pre-tag 校验、不可变 tag 创建、npm publish、Registry/GitHub Release readback 和安装 smoke。
- 移除独立 `authority-probe` deployment 与 tag-push 触发的第二次 workflow；本机发布编排只 dispatch 一次正式事务并跟踪同一 run，不再本机创建或推送 release tag。
- 为受保护事务增加机器可验证的 source/tag/workflow 输入、tag 创建/复用门禁和失败恢复：已有 tag 只接受指向同一 source 的合法 release tag，npm version 只接受同一 integrity，任何漂移均 fail closed。
- 更新 release authority preflight、workflow 契约测试、发布 Skill、checklist 与 current knowledge，使“一次授权对应一个受保护 job”成为显式约束。
- 保持唯一正式 tarball、Trusted Publishing、`next`/`latest` 不交叉推进、GitHub Release 无 binary Assets，以及不可逆事实不回滚。
- **BREAKING**：维护者发布入口从“本机 probe → 本机 push tag → tag workflow”迁移为“本机 dispatch 一次正式 release workflow”；旧的 probe-only inputs 与 tag-push 自动发布入口不再受支持。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `open-source-release-governance`：将发布权威、最终 pre-tag 校验、tag 创建和 publish 定义为同一受保护事务，并规定一次 Environment 审批、dispatch 输入、tag 恢复与失败边界。
- `product-verification-quality`：把正式发布物验证从 tag-push workflow 调整为显式 dispatch workflow，并要求所有可逆门禁先于唯一 protected transaction 且继续复用同一冻结 tarball。

## Impact

- GitHub Actions：`.github/workflows/publish.yml` 的触发器、job topology、权限与 tag 创建所有权。
- 发布脚本：`services/buildr/scripts/release/**` 的 authority/workflow 静态检查、dispatch/跟踪、pre-tag 校验与 tag ensure。
- 发布消费者：`skills/buildr-release/SKILL.md`、`services/buildr/docs/release-checklist.md`、`openspec/knowledge/flows/open-source-release.md`。
- 验证：release contract、integration-candidate-release 与 workflow topology 测试；不新增 npm/GitHub 凭证或本机 publish 回退。
