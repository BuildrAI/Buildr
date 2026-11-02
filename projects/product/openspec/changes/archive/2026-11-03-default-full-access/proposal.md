## Why

用户要求统一省略权限的行为，避免 CLI 与直接调用仍默认受限权限。该改变会扩大新请求的默认执行权限，属于破坏性默认行为变更。

## What Changes

- **BREAKING**：新请求省略 permissionMode 时使用 full-access，显式 default/full-access 和无效值校验保持有效。
- 未支持 full-access 的接入仅对省略值回退 default，预览和运行记录反映实际权限。
- 保留历史缺失字段的 default 解释及旧请求幂等边界，补充 CLI 显式参数。
- Web 新对话无偏好时采用相同默认，保留明确偏好与历史运行。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `agent-conversations`：新请求的默认权限及接入兼容行为。

## Impact

影响智能体领域解析、对话预览和发送、执行器权限映射、CLI、Web 初始选择及对应测试。不修改任务数据，不提交或推送，不增加外部接口或凭据。
