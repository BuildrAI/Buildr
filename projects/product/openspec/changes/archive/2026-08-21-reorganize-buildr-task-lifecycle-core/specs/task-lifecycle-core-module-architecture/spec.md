## ADDED Requirements

### Requirement: Task 生命周期核心必须归属 Task 模块的明确技术分层
Buildr MUST 将 Task Environment、Development、Verification、Execution Record、Planning Identity、Entry Snapshot、Overview 与 Parent Coordination 的 Domain、Application、业务 Persistence 和适用 Interfaces 归入 `src/task` 对应技术层，并 MUST 默认在技术层内保持扁平。迁移完成后旧全局技术层和 `src/task/persistence` 能力子目录 MUST 不再保留这些能力的第二份实现或转发入口。

#### Scenario: 检查生产源码归属
- **WHEN** 架构验证扫描 Task 生命周期核心生产实现
- **THEN** 每项 Domain、Application、Repository、CLI、HTTP 与 internal adapter MUST 只存在于 `src/task` 的对应技术层
- **AND** 旧 `src/domain/<capability>`、`src/application/<capability>`、全局 Task CLI/internal 文件及 capability persistence 子目录 MUST 不再提供同一实现

### Requirement: Task 模块入口必须以独立专业 descriptor 唯一装配核心能力
Buildr MUST 由 `src/task/module.mjs` 为 Task 生命周期核心各专业能力显式声明 required capabilities、provided capabilities 与适用 contributions。Bootstrap MUST 按真实依赖图唯一安装这些 descriptors；每个 Receipt、Result 或执行记录的 Repository writer MUST 保持在所属专业 descriptor 私有 composition 中，不得合并为单一 Task lifecycle writer。

#### Scenario: 创建 Bootstrap runtime
- **WHEN** Bootstrap 安装 Task Record、Environment、Execution Record、Review、Retrospective、Verification、Planning Identity、Development、Parent Coordination、Overview 与 Entry Snapshot modules
- **THEN** registry MUST 只登记每个专业 module 一次并按 requires/provides 满足依赖
- **AND** 缺少 required capability、重复 capability 或重复 contribution 时 MUST fail closed

#### Scenario: 专业 Application 保存 current facts
- **WHEN** Environment、Development、Verification、Execution Record 或 Parent Coordination 执行写操作
- **THEN** 写入 MUST 继续由原专业 Application 与其私有 Repository 完成
- **AND** 其他 Task module、CLI、HTTP、Skill、Bootstrap 或 compatibility consumer MUST NOT 直接写其 SQLite row、Receipt、Result 或正文存储

### Requirement: Task CLI、HTTP 与 internal workflow 必须通过窄模块入口接入
Task 生命周期核心的公开 CLI routes、Task 业务 HTTP adapters 和 retained internal drivers MUST 由所属 Task module contribution 或 port提供。CLI Host 与 Web HTTP Host MUST 只承担通用解析、认证、Session、Worker 隔离、响应发送和 contribution dispatch，不得直接导入或注册核心 Domain、Repository 或 Application；Task Development MUST NOT因此新增公共 CLI。

#### Scenario: 构建 CLI command registry
- **WHEN** CLI Host 合并 Bootstrap module contributions
- **THEN** `task environment`、`task verification`、`task execution-record`、`task parent` 与 `task next` routes MUST 各有唯一 Task module owner
- **AND** CLI Host MUST NOT保留相同 route 的直接 adapter import或重复 command descriptor

#### Scenario: 通过 Buildr Web 读取或协调 Task
- **WHEN** HTTP Host 处理 Overview、Development、Verification、Coordination 或 Execution Record 请求
- **THEN** Task 业务输入校验与 Application 调用 MUST 来自 Task module HTTP contribution或port
- **AND** HTTP Host MUST继续拥有认证、Session、bounded worker与通用响应边界，不得直接读写 Task persistence

#### Scenario: Agent 调用内部 Development 或 Planning Identity
- **WHEN** matching retained controller 执行 bundled `__internal task-development` 或 `__internal task-planning-identity`
- **THEN** internal route MUST 调用 `src/task/interfaces/internal` 中由 Task module 暴露的同一专业 Application
- **AND** candidate checkout、Skill 或调用方 MUST NOT直接执行源码 driver或获得新的公共 mutation surface

### Requirement: 核心迁移必须保持 Finish 集群边界与兼容入口可退出
Task Finish、Terminal Delivery、Delivery Carrier、Activation、Cleanup 与 Finish recovery MUST 保持在本 Change 之外。尚未迁移的 Finish、Verification executor、Doctor 或 Web consumer MAY通过带明确 owner、scope 与退出条件的 compatibility port调用同一 Task module实现，但旧核心 registration、第二 Repository、双读、双写或长期转发文件 MUST NOT保留。

#### Scenario: Finish consumer 使用核心 Task facts
- **WHEN** 现有 Task Finish 或 recovery 实现需要读取 Development、Environment、Verification 或 Execution Record 能力
- **THEN** consumer MUST通过 Task module公开 port或受限 compatibility projection调用同一 owner实现
- **AND** 本 Change MUST不移动 Finish 业务实现、不改变交付副作用、不创建替代 Finish authority

### Requirement: 核心迁移必须保持外部、持久化与发布行为等价
Task 生命周期核心迁移 MUST 保持公开 CLI、HTTP、JSON、Receipt/Result schema、SQLite schema、migration顺序与checksum、事务、锁、CAS、幂等、rollback、文件原子性、状态流、错误映射和 writer authority不变。Development checkout、Application Payload与npm candidate MUST继续提供等价入口，Verification owner与服务架构文档 MUST反映实际新路径和剩余边界。

#### Scenario: 迁移前后执行 Task lifecycle journeys
- **WHEN** checkout或npm candidate执行Environment prepare/inspect/cleanup、Development、Verification、Execution Record、Planning Identity、Entry Snapshot、Overview与Parent Coordination场景
- **THEN** operation、status、diagnostic、effects、JSON shape、SQLite bytes、正文完整性与rollback结果 MUST符合既有契约
- **AND** migration集合、顺序和checksum MUST不发生变化

#### Scenario: 检查发布和验证闭包
- **WHEN** Product构建Application Payload、选择changed-path verification owner或检查架构边界
- **THEN** `src/task/**` 的新增依赖闭包 MUST被正式产物和既有verification capability覆盖
- **AND** 旧路径 MUST不存在漏包、无owner、重复owner或被错误标记为已迁移的Finish职责
