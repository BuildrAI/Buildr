## ADDED Requirements

### Requirement: Environment Receipt 必须提供权威runtime invocation
新Task Environment Receipt MUST从Plan选择的executable authority保存当前机器解析的closed runtime invocation，包括runtime kind、实际executable、版本或内容identity、受控executable search prefix与来源，并 MUST由Task Entry、Preparation和Verification execution route直接消费。Receipt MUST NOT接受或保存任意caller env map、secret、stdin或完整PATH快照。

#### Scenario: Buildr自举使用精确development Node
- **WHEN** Product Environment已从受管foundation解析精确development Node
- **THEN** Receipt与compact route MUST向retained controller和candidate execution提供同一runtime invocation
- **AND** workflow MUST不要求Agent手工转抄`BUILDR_NODE`或机器绝对路径

#### Scenario: 非Node Project
- **WHEN** Project声明与Recipe没有选择Node runtime或Node-backed wrapper
- **THEN** Environment MUST不创建Node probe或注入`BUILDR_NODE`
- **AND** 其runtime invocation MUST只反映该Project真实选择的executable authority

#### Scenario: runtime executable漂移
- **WHEN** 当前机器runtime executable、version或identity不再匹配prepared invocation
- **THEN** live inspect MUST只读返回blocked并指出expected与actual identity
- **AND** prepare MUST按current声明恢复，不得回退PATH中的其他兼容工具

#### Scenario: Workspace外machine executable来自显式authority
- **WHEN** current Plan通过受管foundation或显式machine executable requirement选择Workspace外的工具
- **THEN** Receipt MUST记录该authority、机器解析路径与identity
- **AND** portable Plan、Project declaration与Verification Result MUST不保存该机器绝对路径

### Requirement: Task Environment必须独占capability准备闭包的执行与恢复
Verification admission产生的closed supplemental Plan Request MUST只能通过Task Environment Application合并、执行和保存到同一current Plan/Receipt。Verification runner、Skill或Agent MUST NOT直接创建依赖输出、写Environment store或建立第二份准备Receipt。

#### Scenario: Admission发现辅助Recipe尚未准备
- **WHEN** matching Environment基础准备ready，但selected capability要求的辅助Recipe缺失
- **THEN** Task Environment prepare MUST在同一Environment中执行该Recipe并保存可归因effect
- **AND** 已current基础Recipe MUST复用且不得重复执行

#### Scenario: 辅助准备失败
- **WHEN** required辅助Recipe command失败、超时或output不满足声明
- **THEN** Environment MUST保持blocked并保存capability、scope、Recipe与Step diagnostic
- **AND** Verification MUST不得启动capability execution或把基础Environment ready冒充完整可执行
