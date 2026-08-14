## Why

Buildr 已收敛为“PATH 默认 `buildr` 只属于 npm installation，development checkout 只使用显式 Project bridge”，但 repository onboarding 的 canonical requirement 和 verifier 仍安装 POSIX development CLI wrapper。该残留既与 npm-only 隔离契约冲突，也让 Windows development feedback 在约百秒准备后因无法执行 POSIX 脚本而失败。

## What Changes

- 将 clean-checkout development onboarding 的主证据改为显式 `projects/product/buildr` Project bridge、identity-bound Host Node、development update source、sync、Development Launcher 与最终 Doctor。
- 明确 verifier 必须证明 development checkout 不读取、创建、覆盖或删除 PATH 默认 `buildr`。
- 删除已退役的 development PATH CLI 安装器、卸载器及其重复 lifecycle 测试。
- 用 Git candidate snapshot 代替全仓库复制后重新建库，缩短 Windows changed feedback 的失败反馈时间；保留真实 clean checkout、Git remote、sync 与 Doctor 证据。
- 依据多轮成功 timing 区分测试本体优化与非阻断目标预算校准，不用调高预算掩盖重复准备。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `product-verification-quality`: development checkout onboarding 不再安装 PATH development CLI，改为验证显式 Project bridge、PATH 零 mutation 与跨平台 clean-checkout lifecycle，并保留唯一 primary evidence owner 和非阻断 timing 语义。

## Impact

- `product-verification-quality` canonical spec 与验证 owner 文档。
- repository onboarding verifier、verification registry、Windows high-risk slice、System suite inventory 与 package static validation。
- 删除 `scripts/install-buildr-cli`、`scripts/uninstall-buildr-cli` 和对应 POSIX-only System test。
- development feedback 的 Windows 执行时间、诊断位置和重跑成本；不改变 npm 安装、发布 tarball、npm-owned Launcher 或正式用户 CLI 行为。
