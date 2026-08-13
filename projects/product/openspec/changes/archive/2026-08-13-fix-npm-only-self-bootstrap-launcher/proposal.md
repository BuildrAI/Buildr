# 修复 npm-only 自举 Launcher 激活

## Why

Buildr 已将正式分发收敛为 npm-only，公开 `buildr web launcher` 只管理 npm 安装的本机 wrapper；但 self-bootstrap closeout 仍调用已退役的 `--channel development` 公共参数，导致已交付 Task 无法完成 retained activation 与 Doctor 收尾。

## What Changes

- self-bootstrap closeout 与 development installer 改为使用 retained checkout 中的 development-only Launcher manager。
- manager 必须由 Environment Receipt 绑定的 retained Node 执行，并验证 checkout、Node、successor commit 与 `Buildr Web Dev` identity。
- 公开 npm Launcher 继续拒绝 development channel；内部 manager 失败时在 Doctor 与 Finish resume 前 fail closed。
- 对齐 Buildr package spec、current knowledge、component contribution 与回归测试。

## Capabilities

### Modified Capabilities

- `buildr-package-assets`: 明确 npm-only 正式 Launcher 与 self-bootstrap Development Launcher 的内部管理边界。

## Impact

影响 self-bootstrap closeout、development installer、旧 development launcher 提示、component contribution、Buildr Service current knowledge 与对应 Contract/Integration/System tests；不恢复 SEA、PKG、MSI 或第二正式分发渠道。
