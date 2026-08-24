## ADDED Requirements

### Requirement: 第二轮收敛后顶层生产职责必须全部有 owner
Buildr Service MUST将公共 contract 技术机制、release version、internal workflow route 与 Web HTTP 职责归入明确模块 owner；Bootstrap MUST只负责模块注册、依赖注入、进程入口与生命周期组合。没有独立 owner 的顶层 `src/application`、`src/domain`、`src/interfaces` 生产残留 MUST被删除。

#### Scenario: Bootstrap 进入 Task internal workflow
- **WHEN** Bootstrap 处理内部 Task workflow route
- **THEN** Bootstrap MUST通过 Task module 的公开组装入口调用
- **AND** MUST NOT直接导入 Task internal runner 或维护独立 route mapping

#### Scenario: 扫描最终生产源码布局
- **WHEN** architecture verifier 枚举 `src` 下生产文件
- **THEN** 每个文件 MUST归属 Bootstrap、Infrastructure 或明确业务模块
- **AND** 顶层 `application`、`domain`、`interfaces` MUST不存在生产文件

#### Scenario: 复核前三个 Child owner
- **WHEN** 最终收敛验证检查 Task Execution 与 Verification 路径
- **THEN** 生产实现 MUST继续位于已交付的 Task 与 Verification owner
- **AND** 本 Change MUST NOT恢复旧顶层实现或第二 writer
