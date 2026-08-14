## Why

`v0.1.0-rc.10` 的 tag workflow 已正确安装 Host Node verification harness 依赖，但两个 Host Node job 都只传入 tarball 与 `npm-pack` metadata，没有传入冻结 release artifact manifest，导致 identity 校验在任何 npm 写入前确定性失败。Candidate CI 通过是因为其 artifact adapter 会自动提供 manifest，说明两条正式门禁的输入契约发生了漂移，必须在新 RC 前收敛。

## What Changes

- 让 tag publish 的每个 Host Node job 显式传入下载后的 `release-artifact.json`，使 verifier 同时核对 tarball、pack metadata、manifest 与 application payload digest。
- 扩展 workflow contract test，要求 manifest 输入与 tarball/metadata 一起在 verifier 前建立，并拒绝缺失或错误路径。
- 将版本与发布材料推进到 `0.1.0-rc.11`，记录 rc.10 保留 tag 但未写入 npm Registry、未创建 GitHub Release 的恢复事实。
- 不移动或删除 `v0.1.0-rc.10` tag，不改变唯一 tarball、OIDC authority probe 或 npm dist-tag 规则。

本变更不包含破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `product-verification-quality`: 明确 tag publish Host Node verifier 必须收到并验证冻结 release artifact manifest，workflow contract 必须阻止缺失该输入的配置。

## Impact

- GitHub Actions：`.github/workflows/publish.yml` 的 Host Node job 环境输入。
- 验证契约：`projects/product/services/buildr/test/contract/open-source-release.test.mjs`。
- 发布材料：package/lockfile 版本、CHANGELOG、README 与 release checklist 当前候选说明。
- OpenSpec 与当前认知：`product-verification-quality` delta、Change Brief/impact evidence，以及发布流程说明的必要对齐。
