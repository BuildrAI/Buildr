## Why

OpenSpec 1.13.0 已承担标准规范解析、重建、写前变化检测和异常回滚。Buildr 当前重复处理规范，且把独立同步请求转成归档，造成行为差异和额外验证成本。用户已授权以薄接入替代重复实现，保留相关并行变更检查与必要中断恢复。

## What Changes

- 升级并固定 OpenSpec 1.13.0，原样刷新随包外部技能（Skill）。
- **BREAKING** 标准规范解析、重建和正常写入交回上游；不再默认复制全项目执行两次完整验证。
- 保留相关变更冲突检查；可证明无关的损坏变更只报告提醒。
- 保留版本与工作根验证、跨进程恢复和旧记录的安全识别。
- 独立同步保留变更；归档使用明确的归档入口，不能扩大动作授权。

## Capabilities

### New Capabilities

- 无。

### Modified Capabilities

- `openspec-deterministic-sync`: 上游处理标准规范，Buildr 保留检查与恢复组合。
- `openspec-contract-guard`: 前置检查只保留 Buildr 特有边界，不重复全量验证。
- `agent-task-workflows`: 区分独立同步与归档；使用准确补充指令。
- `openspec-upgrade-integration`: 支持 OpenSpec 1.13.0 并核对兼容边界。

## Impact

范围限于 Buildr 服务（Service）的 OpenSpec 接入实现、随包资产、依赖、相关测试及产品说明。不改变当前认知维护的职责，不发布、不升级主工作空间（Workspace）的外部工具。候选在隔离工作目录完成并验证。
