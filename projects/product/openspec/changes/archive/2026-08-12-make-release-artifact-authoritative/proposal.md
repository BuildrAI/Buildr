## Why

正式 tag 发布目前会重新运行完整 Candidate，并在验证后从 checkout 再次隐式打包发布。这既重复了已经在冻结 `dev → main` tree 上成立的开发回归证据，也没有把“被发布前 smoke 验证的 tarball”与“实际写入 npm registry 的 tarball”绑定为同一个不可变制品。

## What Changes

- 正式发布 workflow 只生成一次 npm tarball，并记录 filename、version、文件清单、SHA-256 与 npm integrity。
- 发布前安装 smoke、`npm publish` 和 CI artifact evidence 必须消费同一个 tarball。
- 删除 tag workflow 中重复的完整 Candidate；正式发布只验证 release artifact、发布契约和外部发布结果。
- 已发布版本的重跑不得重复 publish，必须核对官方 registry 中的版本和 tarball integrity。
- GitHub Release 创建必须可恢复：不存在时创建，已存在时核对 tag、正文与 prerelease/Latest 语义。
- npm publish 后从官方 registry 安装精确版本并运行同等 CLI 生命周期 smoke；失败时保留已完成的不可逆事实并允许同一 tag workflow 安全恢复。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `product-verification-quality`: 增加正式 tag 发布的不可变 release artifact、registry integrity、发布后 smoke 与幂等恢复契约。

## Impact

- `.github/workflows/publish.yml`
- `projects/product/services/buildr/scripts/release/`
- `projects/product/services/buildr/test/verification/release/`
- `projects/product/services/buildr/test/contract/open-source-release.test.mjs`
- `projects/product/services/buildr/docs/release-checklist.md`
- Buildr `buildr-release` Skill 源资产及当前自举 Workspace 投射

不改变 npm package 的公开 CLI、数据格式或 Node 支持范围；不创建 tag、不发布 npm，也不移动 dist-tag。
