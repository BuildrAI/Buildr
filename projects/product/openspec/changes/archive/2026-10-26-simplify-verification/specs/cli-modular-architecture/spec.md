## REMOVED Requirements

### Requirement: 产品验证入口必须共享声明与薄执行层
**Reason**: 清理旧分类、入口及技能职责，保留对应行为证明。
**Migration**: 由本变更四类检查、两个项目技能及同文件的新要求承接。

## ADDED Requirements

### Requirement: 四类公开命令必须共享单一选择执行层
六个日常公开命令 SHALL 使用同一检查登记、选择器和执行器，命令包装层 SHALL 仅解析请求及展示结果，不复制测试成员、环境判断或报告状态。四类 SHALL 是唯一测试类型，准备与发布目标 SHALL 是明确运行事实，不恢复旧日常档位或隐式全局前置门禁。

#### Scenario: 自定义检查请求
- **WHEN** 调用方按类型、相关改动或显式检查身份执行
- **THEN** SHALL 从同一登记解释实际选择、真实依赖、环境缺项和结果；`check` SHALL 不被显式参数缩窄

#### Scenario: 发布内部调用
- **WHEN** 发布工具组合冻结源码或准确原包检查
- **THEN** SHALL 复用同一登记和执行机制，保留准确输入和原生系统证明，不形成另一套公开测试分类

## MODIFIED Requirements

### Requirement: package maintenance 必须组合独立 verifier
Buildr package maintenance application MUST 通过职责明确的 verifier modules 组合 package check，且每个 verifier MUST 提供稳定执行入口和结构化的成功或失败结果。

#### Scenario: 检查 package maintenance facade
- **WHEN** CLI architecture verifier 检查 package maintenance application
- **THEN** command handler MUST 只负责建立共享 package context、调用已登记 verifier 和汇总输出
- **AND** handler 与单项检查模块 MUST NOT 内嵌 Commands、Rules、Skills、runtime 和 workspace 生命周期的完整组合场景

#### Scenario: verifier 报告失败
- **WHEN** 任一 package verifier 发现契约问题或子进程失败
- **THEN** verifier MUST 将问题归属到稳定 step identity
- **AND** 聚合层 MUST 保留可定位诊断而不是仅报告无边界的 package check 失败
