## Why

完整 Candidate 发现 6 处生产代码绕过受管文件系统入口，导致已归档的并发任务能力无法获得完整候选验证。现有 `managed-data-integrity` 已明确禁止这类直接 mutation，现在需要修复实现偏差并恢复验证门禁。

## What Changes

- 将 OpenSpec 确定性同步与收敛中的临时目录创建、临时文件写入和精确清理改为使用注入的文件系统入口。
- 将 Task Finish 大诊断文件改为通过 atomic writer 落盘。
- 保持现有命令输出、临时目录生命周期、失败清理和诊断引用契约不变。
- 补充回归验证，确保受影响生产路径不再绕过受管 mutation 入口。
- 不包含破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `managed-data-integrity`: 明确临时投射、诊断落盘和临时资源清理同样属于生产 mutation，必须使用受审阅且可注入的文件系统入口。

## Impact

- `projects/product/services/buildr/src/application/domains/openspec.mjs`
- `projects/product/services/buildr/src/application/task-finish/task-finish-application.mjs`
- 文件系统 runtime 注入及相关契约测试
- Product Candidate 的 `managed-mutations` 验证
