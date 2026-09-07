# 修正最终任务规范残留

## Why

最终任务系统Change已经完成主要规范收敛，但写后回读发现Task Record仍有两条旧交付投影语义，父任务协调仍有三个旧标题，和当前实现及已确认术语不一致。

## What Changes

- 把Task完成重新表述为业务结果摘要，不再保存或投影机器交付状态。
- 资源清理失败继续与Task结果正交，但由具体资源owner表达。
- 将三个当前Requirement统一为父任务协调（Task Parent Coordination）术语。

## Impact

只修改canonical规范认知，不修改代码、数据、接口、Skill结构或运行行为。
