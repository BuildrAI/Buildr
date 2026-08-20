## Why

Hosted Candidate run `32263961213` 暴露出两个可重复的验证缺口：Host Node `current` tuple 被 checkout 的精确 development Node 约束错误拦截；macOS release tarball Launcher smoke 在固定短 readiness 窗口内失败后又清理了关键日志，无法证明 LaunchServices 子进程实际继承的 Node/PATH 与失败阶段。两者都会让完整 Candidate 在覆盖正确的情况下产生不可解释或不可定位的失败，必须在下一次交付前收敛。

## What Changes

- 明确最低/current Host Node tuple 各自以矩阵安装的实际 Node 作为父进程 executable 与子进程 PATH authority，不能回退到 development checkout 的 `.node-version`。
- 让 macOS Launcher wrapper 和 release smoke 显式冻结 Host Node bin 的 PATH 首项，并记录父子进程可审计 Node identity。
- 将 Launcher readiness 预算从固定重试次数改为基于当前失败与历史成功耗时的独立 wall-clock budget；它必须明显小于 capability/job timeout，且不通过扩大外层 timeout 掩盖失败。
- Launcher readiness 失败时，在临时安装根清理前保留 launcher log、instance、process 和 elapsed evidence，并让 Candidate diagnostics 引用这些证据。
- 补充 Host Node 矩阵、PATH 冲突、readiness 超时和失败 evidence 的自动化回归测试；Candidate 覆盖、单一 tarball artifact 和 fail-closed aggregate gate 保持不变。

本变更不包含破坏性变更，不发布 npm package 或 GitHub Release，也不改变 `release-0.1.0-rc.20` retrospective disposition。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `product-verification-quality`: 收紧 Host Node tuple 的实际 runtime authority，并规定 Launcher readiness 的独立预算与失败诊断保留。
- `open-source-release-governance`: 扩展 exact Node/PATH contract，使 LaunchServices/Launcher 后代进程和失败 evidence 也受同一权威环境约束。

## Impact

- 影响 Candidate Host Node entry、verification executor、release tarball smoke、macOS product launcher wrapper及其 contract/integration tests。
- 影响 OpenSpec 的产品验证质量与开源发布治理要求，以及本 Change 的 Brief/current knowledge impact evidence。
- 不减少 Candidate capability 或平台覆盖，不改变 aggregate gate 输入与 fail-closed 语义，不引入旁路存储或公共发布副作用。
