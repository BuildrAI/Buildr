# task-lifecycle-core-module-architecture Specification

## Purpose

定义 Task 生命周期核心编排在 `task` 模块中的技术分层、窄模块入口、唯一装配、Host contribution 与 Finish 排除边界。

## Requirements

### Requirement: Task 生命周期核心必须归属 Task 模块的明确技术分层
Buildr MUST将Task Record、Environment、Review、Verification、Retrospective、Overview与Parent Coordination归入`src/task`对应技术层。Task Development、Task Planning Identity、Task Finish legacy cluster与Terminal Delivery MUST不存在生产实现、转发入口或runtime port。

#### Scenario: 检查生产源码归属
- **WHEN** 架构验证扫描Task生产实现
- **THEN** 保留能力的Domain、Application、Repository、CLI和HTTP MUST只有一个owner
- **AND** 退役能力的文件、export、descriptor和route MUST不存在

### Requirement: Task 模块入口必须以独立专业 descriptor 唯一装配核心能力
Buildr MUST由唯一Task module为保留的专业能力声明required/provided capabilities与contributions；本次直接重写的Overview、Repository和HTTP契约 MUST使用严格TypeScript单一人工源码。Bootstrap MUST不安装Development、Planning Identity、legacy Finish或Terminal Delivery descriptor。

#### Scenario: 创建 Bootstrap runtime
- **WHEN** Bootstrap组装Task modules
- **THEN** registry MUST只安装保留能力
- **AND** runtime MUST不存在退役Application和persistence methods

#### Scenario: 专业 Application 保存 current facts
- **WHEN** Task Record、Environment、Review、Verification或Retrospective写入自己的current事实
- **THEN** mutation MUST只经过所属descriptor的私有repository
- **AND** MUST不存在统一Task lifecycle writer

### Requirement: Task CLI、HTTP 与 internal workflow 必须通过窄模块入口接入
Task module MUST只贡献保留的Task Record、Environment、Review、Verification、Retrospective、Overview与Parent Coordination接口。Internal workflow catalog MUST不包含Task Development或Task Planning Identity；CLI MUST不包含旧Finish/Delivery inspect。

#### Scenario: 构建 CLI command registry
- **WHEN** package和Doctor检查Task route inventory
- **THEN** 退役route与命令 MUST不存在
- **AND** 保留入口 MUST继续解析到唯一owner

#### Scenario: Agent 调用内部 Development 或 Planning Identity
- **WHEN** Agent调用已删除的internal route
- **THEN** router MUST返回unknown route且零副作用
- **AND** MUST不提供兼容转发

#### Scenario: 通过 Buildr Web 读取或协调 Task
- **WHEN** Web读取Overview、Review、Verification或Parent Coordination
- **THEN** HTTP contribution MUST调用所属保留Application
- **AND** MUST不装配Development、Planning Identity、Finish或Terminal Delivery

### Requirement: Task核心迁移必须保持当前外部行为等价
Task module结构变化 MUST保持Task Record、Environment、Review、Verification、Retrospective、Overview与Parent Coordination的公开行为、持久化和package/runtime parity；已退役模块不属于兼容范围。

#### Scenario: checkout与npm candidate执行当前Task能力
- **WHEN** 两种入口执行同一当前Task操作
- **THEN** 输出、写入与错误语义 MUST等价
- **AND** MUST不装配退役descriptor或compatibility port
