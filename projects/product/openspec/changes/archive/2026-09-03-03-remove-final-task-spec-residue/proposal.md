# 删除最终任务规范残留

## Why

最终回读发现公共JSON、CLI、package和验证规范仍要求已经删除的Task Entry、Execution Record、Parent Plan v2、Parent Coordination v3及旧Finish交付投影。

## What Changes

- 删除已退役Task运行接口和旧父任务计划/协调版本要求。
- 让开发反馈、Product Candidate、Release与跨路径验证只引用当前owner事实。
- 保留明确的退役无残留条款作为当前禁止边界。

## Impact

只删除或替换过期canonical Requirements；不修改代码、数据、接口、Skill或能力绑定。
