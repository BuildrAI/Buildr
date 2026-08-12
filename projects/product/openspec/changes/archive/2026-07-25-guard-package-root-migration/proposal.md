## Why

Buildr 已将可执行 npm package 从 Product Project root 迁移到 Buildr Service root；旧包根的 `node_modules` 不受 Git 跟踪，迁移后仍可保留旧版本的同名 CLI。当前验证只解析 Service package root，无法发现该遮蔽入口，维护者可能从已废弃目录运行错误版本的工具。

## What Changes

- 将 Product Project root 与 Buildr Service package root 的分离约束扩展到 package-manager 安装产物：已迁移的旧包根不得保留 `node_modules` 或其 `.bin` 入口。
- 为产品架构/包验证增加检查与测试：发现 Product Project root 的遗留依赖目录时失败，并给出仅针对该已废弃包根的清理指引。
- 修正维护指引中仍将依赖安装指向 Product Project root 的表述，统一指向 Buildr Service package root。

## Capabilities

### New Capabilities

<!-- None. -->

### Modified Capabilities

- `product-source-layout`: 将已迁移 package root 的依赖目录和 CLI 遗留物纳入 Product root / Service root 单一所有权边界与验证契约。

## Impact

- 受影响实现：Product architecture/package verification、对应单元或集成测试，以及开发维护文档。
- 不改变已发布 CLI 的用户命令、workspace 依赖目录或 `buildr update` 的所有权；清理只适用于可证明已废弃的 Product Project 包根。
