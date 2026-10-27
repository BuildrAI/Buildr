## Why

Codex 使用 Devin SWE-2 的默认权限请求在执行工具前被拒绝。有界对照已定位到原生审批说明的一句文字；保留审批含义的改写通过完整说明控制及真实原生工具读取，需要将验证过的兼容方式交付，避免用户为调用模型而提高权限。

## What Changes

- 仅对 Codex 系统说明中已知默认权限区块的一句审批问题说明使用等义表达，保留原示例、其他规则、工具与参数。
- 保持原生 `workspace-write`、`on-request` 及禁止网络访问配置；验证工作目录内编辑与拒绝审批后的边界。
- 真实验证通过后允许 Codex 在默认权限下选择 Devin SWE-2，保留其他未经验证组合的限制及按权限绑定原生上下文的行为。
- 更新已有智能体接入说明和随包使用指引。本次没有破坏性变更，不改账号或外部桌面配置。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `unified-model-subscriptions`: Codex 可在默认权限和完全访问下使用 Devin SWE-2；权限说明兼容不得削弱实际授权或必要规则。

## Impact

涉及 `buildr-agent` 的 Devin 请求适配、`buildr-web` 的兼容选择与相关测试；既有 `agent-integration.md` 及 `agent-operations.md` 需校准可用条件。接口形状、凭据归属、沙箱和审批机制不变，代码地图及架构图职责关系不变。
