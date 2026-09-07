## MODIFIED Requirements

### Requirement: Task 生命周期核心必须归属 Task 模块的明确技术分层
Buildr MUST将Task Record、Review、Verification、Overview与Parent Coordination归入`src/task`。复盘文档读取归Task Record；Task Retrospective Application与其他已退役模块 MUST不存在。

#### Scenario: 检查生产源码归属
- **WHEN** 架构验证扫描Task实现
- **THEN** 保留能力 MUST只有一个owner
- **AND** Retrospective Domain/Application/Repository/Driver/route MUST不存在

### Requirement: Task 模块入口必须以独立专业 descriptor 唯一装配核心能力
Buildr MUST由唯一Task module声明当前专业descriptor；Task Record及复盘文档读取使用严格TypeScript单一人工源码。Bootstrap MUST不安装Retrospective descriptor。

#### Scenario: 创建 Bootstrap runtime
- **WHEN** Bootstrap组装Task modules
- **THEN** registry MUST只安装保留能力

#### Scenario: 专业 Application 保存 current facts
- **WHEN** Task Record、Review或Verification写入自身事实
- **THEN** mutation MUST只经过所属repository
- **AND** 复盘正文 MUST不进入Application writer

### Requirement: Task CLI、HTTP 与 internal workflow 必须通过窄模块入口接入
Task module MUST只贡献Task Record、Review、Verification、Overview与Parent Coordination接口。Task内部workflow catalog/router MUST不存在。

#### Scenario: 构建 CLI command registry
- **WHEN** package检查Task route inventory
- **THEN** Retrospective route与Driver MUST不存在

#### Scenario: Agent 调用内部 Development 或 Planning Identity
- **WHEN** Agent调用已删除internal route
- **THEN** CLI MUST返回unknown action且零副作用

#### Scenario: 通过 Buildr Web 读取或协调 Task
- **WHEN** Web读取Overview、Review、Verification或Parent
- **THEN** HTTP MUST调用所属Application
- **AND** 复盘文档 MUST只通过Task Record read接口读取

### Requirement: Task核心迁移必须保持当前外部行为等价
Task module结构变化 MUST保持Task Record、Review、Verification、Overview与Parent Coordination的公开行为；Retrospective Application已退役，不属于兼容范围。

#### Scenario: checkout与npm candidate执行当前Task能力
- **WHEN** 两种入口执行同一当前Task操作
- **THEN** 输出、写入与错误语义 MUST等价
- **AND** MUST不装配Retrospective或其他退役descriptor
