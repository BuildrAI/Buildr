## Why
上次修复只为两个模型补齐了已知上限，未解决 Magpie 目录只返回默认值时 Buildr 错把它当上限的问题。

## What Changes
区分网关默认值、明确报告的最大值、用户覆盖和执行生效值。缺少最大值允许手动配置，不推测上游能力；移除模型名特例，其他来源不改变。

## Capabilities
### New Capabilities
无。
### Modified Capabilities
- `magpie-model-provider`：整个目录采用一致的默认、上限与覆盖规则。

## Impact
模型目录与偏好、HTTP 投影、模型管理窗口编辑及执行绑定。
