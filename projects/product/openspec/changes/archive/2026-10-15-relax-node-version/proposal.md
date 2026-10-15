## Why

开发入口已接受较新的 Node，但完整验证和发布准备仍要求精确等于 `24.15.0`，造成同一环境先获准进入、随后被拒绝。用户要求统一使用最低版本要求，避免无实际兼容性依据的精确版本阻塞。

## What Changes

- Buildr 开发、运行、验证、候选构建和 DSH 插件（Plugin）准备统一允许稳定版 Node `>=24.15.0`，移除版本相等和主版本上限限制。
- 持续集成（CI）继续选用基准版本及宿主矩阵，具体执行仍绑定同一可执行文件与实际版本；改变工具链后不冒用旧验证。
- 同步当前规范及直接相关说明，不改历史发布证据、已归档设计或外部 SDK 的固定源码与包管理器（Package Manager）。这是兼容范围扩展，无既有合法输入失效。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `buildr-service-typescript-execution`：原生开发执行使用最低版本范围。
- `npm-cli-package`：统一运行和开发最低版本要求，接受更高主版本。
- `open-source-release-governance`：发布准备消费满足最低版本的实际 Node，保留执行身份一致性。
- `product-verification-quality`：验证入口不再按基准版本相等拒绝兼容 Node。
- `dsh-plugin-distribution`：插件构建与 SDK 准备接受满足最低版本的 Node。

## Impact

涉及主包元数据及锁文件、开发和安装入口、验证与发布工具、插件准备和针对性测试。不会下载或切换用户默认 Node，不触发公开发布，不修改真实 DSH 配置。其他主版本的具体兼容结果由实际执行证明，放行版本不代表已覆盖所有平台。
