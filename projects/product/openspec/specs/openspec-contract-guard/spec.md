# OpenSpec contract guard 规范

## Purpose

定义 Buildr 对 OpenSpec change 的 Requirement 基线、跨 change 冲突、同步前后验证、上游兼容性和 Agent-readable CLI 契约。

## Requirements

### Requirement: 前置检查只保护当前相关变更
Buildr MUST提供只读 preflight，解析真实工作根和锁定上游版本，使用上游解析检查同一规范条目的活跃变更冲突。已证明无关的损坏变更 MUST只形成提醒；无法确定重叠范围时 MUST保守报告具体缺口。

#### Scenario: 无关变更损坏
- **WHEN** 另一变更不触及本次规范且其正文校验失败
- **THEN** 当前相关检查可继续并附带提醒

### Requirement: 同步与归档必须保持动作边界
Buildr MUST保留独立同步与归档的区别；sync 接入 MUST NOT调用包含归档副作用的 converge。converge MUST只在归档属于授权目标时执行，inspect MUST只读取恢复现场。

#### Scenario: 只要求同步
- **WHEN** 用户要求更新主规范并保留当前变更
- **THEN** 系统保持变更 active，不调用归档
