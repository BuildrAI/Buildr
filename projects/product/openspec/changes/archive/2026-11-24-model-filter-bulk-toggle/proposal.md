## Why

筛选后批量按钮未明确显示作用范围或可修改状态；连续操作可能携带上一笔保存前的版本。

## What Changes

- 显示当前筛选命中数和已启用数；批量启停仅改动当前筛选下可操作且状态需要改变的模型。
- 同一页面连续保存沿用自己确认的版本，不覆盖外部更新。

## Capabilities

### Modified Capabilities

- `model-usage-controls`: 明确筛选批量操作的范围和连续保存行为。

## Impact

Harness 模型设置前端及回归测试；后端接口、权限和账号配置不变。
