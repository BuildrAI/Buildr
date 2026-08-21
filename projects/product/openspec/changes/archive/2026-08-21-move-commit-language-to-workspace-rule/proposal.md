## Why

Buildr 当前把提交语言默认值设计为 Core 规则的一部分，但提交信息的格式和生成行为实际由 Git Operations 与各类提交消费者共同使用，导致 Core 规则回退时英文提交重新出现。需要把“默认中文提交信息”作为随包 workspace 的通用工作约定交付，使初始化和同步得到的用户 workspace 在 Git Operations、Task Finish 及其他提交路径中保持一致。

## What Changes

- 在随包 workspace `AGENTS.md` 中声明：没有更具体的 Project、Service 或 repository 约定时，Git commit message 默认使用中文。
- 删除 Buildr Core 对默认提交语言的所有产品契约和验证要求；Core 继续保留通用术语和边界规则。
- 调整 Git Operations 相关契约，使其遵循 workspace/Project/Service/repository 的提交语言约定，并保留 Conventional Commits 格式与 Git 安全边界。
- 调整受影响的 Task Finish 与 package 组合验证，确保正式 Delivery Carrier 也消费同一 workspace 约定。
- 不改写既有 Git 历史，不新增 commit hook，不改变 `type`、scope、正文或 Task trailer 的既有格式边界。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `buildr-package-assets`: 将默认提交语言从 required Core 迁移到随包 workspace `AGENTS.md`，并调整 package 验证边界。
- `product-agent-skills`: 让 Git Operations 遵循 workspace scope 的默认提交语言，而不是复制或依赖 Core 的提交语言契约。

## Impact

- 随包 workspace 源资产：`package/targets/workspace/AGENTS.md`。
- Core 规则、Git Operations Skill/contract、Task Finish 相关说明与 package/runtime parity 测试。
- Product OpenSpec canonical specs 与验证声明；不改变 Git 数据、Task Record schema、Delivery authority 或远端行为。
