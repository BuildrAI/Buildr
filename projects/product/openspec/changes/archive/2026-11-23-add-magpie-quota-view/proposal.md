## Why
Magpie 是一个网关而不是付费账号。用户需要从 Buildr 查看经它接入的上游额度，但不能把不同账号或单位合并。

## What Changes
- Magpie 来源的「账号与额度」只读展示各上游账号的观察，允许重新读取 Magpie 记录。
- 不影响模型选择、来源绑定、路由或发送。无破坏性变更。

## Capabilities
### New Capabilities
无。
### Modified Capabilities
- `magpie-model-provider`：显示上游账号各自的额度观察。

## Impact
Harness 读取接口、Magpie 供应商适配与 Harness Web 的 Magpie 详情。
