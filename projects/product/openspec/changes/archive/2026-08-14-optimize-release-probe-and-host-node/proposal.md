## Why

`0.1.0-rc.9` 的 tag 发布暴露出两个发布链路问题：独立 Host Node job 未准备 checkout 验证脚本依赖，导致在公开写入前确定性失败；候选准备与正式发布又在短时间内重复执行同一种 OIDC authority probe。现在需要让发布验证在隔离 runner 上可重复成立，并把一次性短时发布授权收敛到真正创建 tag 的时点。

## What Changes

- 让 tag publish 的每个 Host Node job 使用 lockfile 独立准备验证脚本依赖，不依赖其他 job 的 `node_modules`。
- 增加 workflow 契约回归，阻止 checkout 验证脚本在缺少依赖准备时进入隔离 runner。
- 候选准备阶段只完成 source、tree、version、branch protection、workflow structure 与远端竞争检查，不触发真实 OIDC token exchange。
- 只有维护者明确授权正式发布后，才在创建 tag 前运行唯一一次短时 authority probe，并立即由 pre-tag convergence 消费。
- 保持 tag workflow 对最终正式 tarball 的 Host Node、Launcher、publish 与 Registry readback 验证，不把该验证误删为 Candidate 重复项。
- 基于修复后的最新 `dev` 准备 `0.1.0-rc.10`，保留失败的 `v0.1.0-rc.9` tag 且不移动、不覆盖。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `open-source-release-governance`：把 hosted authority probe 明确为正式发布授权后的单次、紧邻 tag 门禁，候选准备不得提前消费真实 OIDC exchange。
- `product-verification-quality`：要求 tag workflow 的独立 Host Node runner 自行准备 checkout 验证依赖，并继续消费同一冻结正式 tarball。

## Impact

- 发布编排与材料：`skills/buildr-release/SKILL.md`、`services/buildr/docs/release-checklist.md`、`openspec/knowledge/flows/open-source-release.md`。
- GitHub Actions：仓库根 `.github/workflows/publish.yml`。
- 发布契约与测试：`services/buildr/test/contract/**`、`services/buildr/test/integration-candidate-release/**` 及相关 release helpers。
- 版本与说明：Buildr package/lockfile、根 `CHANGELOG.md`、README 当前版本入口及 rc.10 发布材料。
- 外部状态：`v0.1.0-rc.9` 保持已存在但未发布 npm/GitHub Release；本 Change 不删除或移动该 tag。
