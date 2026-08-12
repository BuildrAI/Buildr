## MODIFIED Requirements

### Requirement: 产品验证步骤必须由统一 registry 声明
Buildr Product MUST 使用单一 verification registry 声明所有可编排 step 的稳定 id、显示名称、执行命令、输入路径、真实执行依赖、profile/group、预算、并发类别、可选调度成本、artifact 需求、环境足迹、隔离方式和重置负担，并 MUST 在执行前验证 registry 完整性；`dependsOn` MUST NOT 用于表达 profile 完整性或建议门禁顺序。Planner MUST 根据这些显式事实判断 Component 与 Quick 准入，MUST NOT 根据 step id、目录名或暂时实测耗时补猜资格。

#### Scenario: registry 定义合法
- **WHEN** fast、focus、changed 或 Candidate 解析 verification registry
- **THEN** 每个 step id MUST 唯一且引用的依赖、profile、group、concurrency class 和 executor MUST 已登记
- **AND** 每个 step MUST 声明闭合、可校验的环境足迹、隔离方式与重置负担
- **AND** 可选 `schedulingCostMs` MUST 是正整数
- **AND** dependency graph MUST 无环
- **AND** 声明消费候选 artifact 的 step MUST 依赖对应 artifact producer

#### Scenario: registry 定义非法
- **WHEN** registry 存在重复 id、未知依赖、依赖环、artifact consumer 缺失 producer 依赖、缺失执行信息、非法 `schedulingCostMs`、缺失环境事实或非法准入组合
- **THEN** planner MUST 在启动任何验证进程前 fail closed
- **AND** 诊断 MUST 标识无效 step 与原因

#### Scenario: Component 穿过真实环境边界
- **WHEN** step 声明为 Component，但环境足迹包含真实 filesystem、CLI、Git、网络或完整 Workspace 生命周期，或声明任何 reset burden
- **THEN** planner MUST 拒绝该 registry
- **AND** MUST NOT 因 step 名称或目标耗时较低允许其进入 Component

#### Scenario: Quick step 需要重复重置
- **WHEN** step 属于 Quick，但需要重复初始化、迁移、安装、环境清理或完整生命周期
- **THEN** planner MUST 拒绝该 registry
- **AND** 诊断 MUST 明确指出其 reset burden 不符合 Quick

#### Scenario: 低成本 Integration 申请进入 Quick
- **WHEN** Integration step 属于 Quick
- **THEN** registry MUST 明确声明有界目标耗时、可测环境足迹、独立隔离且无 reset burden
- **AND** step 包含 network、Git、Workspace lifecycle 或共享可变环境时 planner MUST fail closed

#### Scenario: step 只需要共同通过而不消费输出
- **WHEN** 两个 verifier 由同一 Fast 或 Candidate profile 选择但彼此不消费输出
- **THEN** registry MUST NOT 仅为了固定运行顺序在二者之间声明 `dependsOn`
- **AND** scheduler MAY 按并发类别和可选调度成本并行执行二者

### Requirement: 低成本 Node 验证必须按测试语义分层
Buildr Product MUST 将 Node tests 按 Unit、Component、Contract、Integration 与 System 的真实执行边界提供稳定入口；Quick MUST 聚合完整低成本 Unit、Component、静态 Contract 和必要静态检查，MUST NOT 因历史文件名、step 名称或暂时较快把真实 filesystem、CLI、Git、网络、Workspace 生命周期或重复重置测试归入低成本入口。

#### Scenario: 运行纯单元测试
- **WHEN** 维护者运行 `npm run test:unit`
- **THEN** verifier MUST 只发现直接调用同进程产品模块的 unit tests
- **AND** 这些测试 MUST NOT 启动真实 CLI、Git 或 npm 子进程

#### Scenario: 运行有界组件测试
- **WHEN** 维护者运行 `npm run test:component`
- **THEN** verifier MUST 验证单一有界 Application 组装并使用 fake 或内存实现替代外部系统
- **AND** verifier MUST NOT 穿过真实 filesystem、CLI、Git、网络或完整 Workspace 生命周期

#### Scenario: 运行契约测试
- **WHEN** 维护者运行 `npm run test:contract`
- **THEN** verifier MUST 只检查源码结构、manifest、文档、Skills、schema 或 entrypoint declaration 的一致性
- **AND** static contract MUST 自动拒绝 Contract 目录中新引入的真实子进程、Git、网络或可变临时环境测试

#### Scenario: 运行技术集成测试
- **WHEN** 维护者运行 `npm run test:integration`
- **THEN** verifier MUST 运行跨真实 filesystem、Git 或子进程技术边界的测试
- **AND** verifier MUST 不把完整公共入口或 Workspace 生命周期降格为 Integration
- **AND** 从 Contract 迁出的真实环境测试 MUST 保留 changed/affected、Candidate 与 focus 可选择性

#### Scenario: 运行系统测试
- **WHEN** 维护者运行 `npm run test:system`
- **THEN** verifier MUST 运行完整 CLI、Workspace、Local App 或 Task 生命周期 System 测试
- **AND** Product MUST NOT 保留将同一 System 集合命名为 `test:integration:fast` 的第二入口
- **AND** runner MUST 保留明确的文件集合、退出码、signal 与失败 diagnostics，不得把无 TAP 输出的聚合失败变成不可定位结果

#### Scenario: 验证全部 CLI help
- **WHEN** CLI compatibility verifier 检查全部公开 help topics
- **THEN** 所有 topic 的路由与 Usage 内容 MUST 在同一进程中穷举验证
- **AND** 代表性的 root、普通、深层 Task、App、Finish 与 runtime-dependent topics MUST 继续通过真实 CLI 进程验证 stdout、exit status、两种 help form 与零写入
- **AND** verifier MUST NOT 为每个 topic 重复启动两次完整产品进程

#### Scenario: 聚合低成本验证
- **WHEN** 维护者运行 `npm test` 或 `npm run test:fast`
- **THEN** unified registry MUST 只选择显式满足环境足迹、隔离方式和 reset burden 准入的低成本 steps
- **AND** 每层 MUST 保留稳定 step identity、失败状态和 diagnostics
