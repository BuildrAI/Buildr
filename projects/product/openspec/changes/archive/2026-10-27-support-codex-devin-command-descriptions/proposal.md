## Why

同账号真实请求已确认 Codex 两个命令工具的原用途说明触发 Devin 的 MCP 配置拒绝；同名同参数的同义说明消除了这项拒绝。保留完整原生上下文和完全访问模式时，SWE-2 的 high/max 已完成读取和结果接续，继续统一置灰会隐藏已可用组合。默认权限仍遭内容策略拒绝，GPT-6.1 Sol 仍受额度阻断，不能统一开放。

## What Changes

- 在 Devin 来源内，仅对 Codex 两个工具的精确已知原说明使用同义表达；保留参数、名称和权限上下文，未知说明原样传递。
- 对话仅新增 Codex + Devin SWE-2 + 显式完全访问这一可选组合；旧选择和草稿保留，模式切换重新校验，不自动提权。
- 补充协议和网页验证，并校准已有接入说明与操作指引。无破坏性数据变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `unified-model-subscriptions`：精确工具说明兼容及按执行方、模型、权限判断当前可选条件。

## Impact

影响 buildr-agent 的 Devin 请求构造、buildr-web 的选择及发送校验和已有用户指引；不新增接口、依赖、持久状态或权限类型。依据和完整原始对照仅保留本机任务证据。
