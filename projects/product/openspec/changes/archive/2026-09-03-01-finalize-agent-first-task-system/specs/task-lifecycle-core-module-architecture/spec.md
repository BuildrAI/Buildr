## MODIFIED Requirements

### Requirement: Task 生命周期核心必须归属 Task 模块的明确技术分层
Buildr MUST将Task Record、Review、Verification与父任务协调查询归入`src/task`。Task Overview、Task Environment、Task Development、旧Finish、Retrospective Application与其他退役模块 MUST不存在。

#### Scenario: 检查生产源码归属
- **WHEN** 架构验证扫描Task实现
- **THEN** 每个保留能力 MUST只有一个owner
- **AND** MUST不存在Overview descriptor、Repository、Application或HTTP contribution

### Requirement: Task CLI、HTTP 与 internal workflow 必须通过窄模块入口接入
Task module MUST只贡献Task Record、Review、Verification与父任务协调接口。Task内部workflow catalog/router和Overview contribution MUST不存在。

#### Scenario: Bootstrap组装Task模块
- **WHEN** runtime安装Task descriptors
- **THEN** MUST只安装保留模块
- **AND** Overview route与runtime port MUST不存在

#### Scenario: Buildr Web读取Task
- **WHEN** Web读取Task detail、Review、Verification或父任务协调
- **THEN** HTTP MUST调用所属Application
- **AND** MUST不先读取统一Overview

#### Scenario: 构建 CLI command registry
- **WHEN** package检查Task route inventory
- **THEN** MUST只登记保留的Task命令
- **AND** Overview、Retrospective、Environment、Development与旧Finish route MUST不存在

#### Scenario: Agent 调用内部 Development 或 Planning Identity
- **WHEN** Agent调用已删除internal route
- **THEN** CLI MUST返回unknown action且零副作用

#### Scenario: 通过 Buildr Web 读取或协调 Task
- **WHEN** Web读取Task、Review、Verification或父任务协调
- **THEN** HTTP MUST调用所属Application
- **AND** 复盘文档 MUST只通过Task Record read接口读取

### Requirement: Task核心迁移必须保持当前外部行为等价
Task模块变化 MUST保持Task Record、Review、Verification与父任务协调的当前行为；已删除Overview不属于兼容范围。

#### Scenario: checkout与npm package执行当前Task能力
- **WHEN** 两种入口执行同一保留Task操作
- **THEN** 输出、写入与错误语义 MUST等价
- **AND** 旧Overview endpoint MUST均返回not found

#### Scenario: checkout与npm candidate执行当前Task能力
- **WHEN** checkout与npm candidate执行同一保留Task操作
- **THEN** 输出、写入与错误语义 MUST等价
- **AND** MUST不装配Overview或其他退役descriptor
