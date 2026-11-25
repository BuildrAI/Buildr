## Why

Magpie 上游额度与直连来源混排，不容易集中查看；账号掩码不能帮助识别，反而占用浮窗空间。

## What Changes

- 将所有 Magpie 额度移到浮窗末尾的独立区块，按上游分组、不合计。
- 浮窗移除 Magpie 账号掩码，保留套餐及必要的账号编号。不涉及数据迁移、协议或设置详情变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `model-usage-controls`：区分直连来源排序与末尾 Magpie 区块。
- `magpie-model-provider`：定义浮窗区块与账号展示规则。

## Impact

覆盖独立 Harness 和 Development 共用的供应商额度浮窗；不改变额度接口、刷新、设置详情或模型选择器。
