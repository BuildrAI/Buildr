## ADDED Requirements

### Requirement: Workspace source 区分 Managed Root 与 Attached Root
Buildr MUST 将 Project/Service source 的 location topology 表达为 Managed Root 或 Attached Root，并 MUST 保持 entity identity、Git declaration、location 与 ownership policy 分离。

#### Scenario: 兼容读取既有 managed source
- **WHEN** canonical v2 source 没有声明 `root`
- **THEN** Buildr MUST 将其投影为 `root: managed`
- **AND** 重复 render MUST 保持既有 managed manifest bytes 的 source shape兼容

#### Scenario: 解析 Attached Root
- **WHEN** source 声明 `root: attached` 与规范化绝对 `path`
- **THEN** Buildr MUST 使用实际 filesystem/Git topology解析该 root
- **AND** MUST NOT 将该 path解释为 Workspace-owned content

#### Scenario: Attached Root identity 不可证明
- **WHEN** path 不可访问、不是独立 Git top-level、remote 不匹配或 realpath 与其他 source 冲突
- **THEN** 依赖该 source 的 mutation MUST fail closed
- **AND** 不依赖该 source 的只读或其他 ownership unit action MUST 保持可用

### Requirement: Attached Root 接入不得取得内容 ownership
Buildr MUST 只在用户明确选择现有绝对路径后登记 Attached Root，并 MUST NOT 因登记自动 clone、copy、move、relink、checkout、修改或删除外部内容。

#### Scenario: 附接既有 Git Project
- **WHEN** Agent执行 `project create <code> --attach <absolute-path>` 且Git identity通过预检
- **THEN** Buildr MUST只写Project registry relation
- **AND** Attached Root bytes、branch、worktree 与 remote MUST保持不变

#### Scenario: 附接既有 Git Service
- **WHEN** Agent执行 `service create <project>/<service> --attach <absolute-path>` 且父Project与Git identity唯一
- **THEN** Buildr MUST只写该Project的Service registry relation
- **AND** MUST NOT复制外部Service内容到默认managed path

#### Scenario: 外部删除未授权
- **WHEN** unregister、sync、reconcile或cleanup没有独立证明Attached Root删除ownership与明确授权
- **THEN** Buildr MUST保留外部内容
- **AND** MAY只移除已授权的registry relation

### Requirement: Doctor 提供动作局部与分域健康
Buildr Doctor MUST 为finding声明domain、scope、affected actions与ownership unit，并 MUST从这些facts投影分域health；总体health MUST NOT表示通用工作许可。

#### Scenario: 无关 Runtime 漂移
- **WHEN** Runtime finding只影响某adapter的render/sync action
- **THEN** 对应Runtime domain MUST报告drift与blocked action
- **AND** Project源码inspect、Git工作与无关Component action MUST NOT因此blocked

#### Scenario: Attached Project unavailable
- **WHEN** 一个Attached Project path在当前机器不可访问
- **THEN** Project与相关Git domain MUST报告unavailable
- **AND** 其他Project/Service及Workspace独立ownership unit MUST继续诊断和收敛

#### Scenario: required Core 或共享 transaction 冲突
- **WHEN** finding证明required Core integrity、source identity、路径边界或共享transaction无法安全局部分离
- **THEN** 受影响原子批次 MUST fail closed
- **AND** Doctor MUST明确报告实际harm、blocked actions与ownership unit

### Requirement: Consumer 必须按 action 消费诊断
Capability、Component、Workspace sync与其他consumer MUST声明当前action及其依赖的domain/ownership units，并 MUST NOT把Doctor聚合`ready`当作通用许可。

#### Scenario: optional ownership unit 冲突
- **WHEN** sync plan中的optional或foreign-owner unit冲突且与required unit可安全分离
- **THEN** Buildr MUST保留冲突unit并报告
- **AND** MUST提交其他已通过preflight的独立unit

#### Scenario: capability provider 局部blocked
- **WHEN** capability route只对一个consumer缺少或存在歧义
- **THEN** Buildr MUST只阻止依赖该route的消费动作
- **AND** MUST NOT把整个Skill、Project或Workspace报告为不可工作

#### Scenario: Component 原子边界
- **WHEN** Component member integrity或ownership冲突
- **THEN** Buildr MUST阻止该Component atomic unit
- **AND** 无依赖的其他Component或builtin unit MUST保持可收敛
