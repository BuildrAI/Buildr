## MODIFIED Requirements

### Requirement: Buildr 状态变更后必须 doctor 验证
Buildr 资产维护技能（Skill）及对应维护能力 MUST 核验本次改变的源资产、内置能力或智能体运行时（Agent Runtime）状态，并消费适用于同一目标、来源和运行时的最终诊断（Doctor）结果。已有结果在相关内容及条件未变时 MUST 复用；没有适用结果时 MUST 执行对应诊断。诊断 MUST 绑定具体维护动作，不得作为任务（Task）、工作空间（Workspace）或智能体（Agent）所有工作的统一完成许可；相关错误使本次维护结果不成立时 MUST 如实报告，不能用局部诊断撤销其他已成立事实。

#### Scenario: Workspace 源资产或 runtime 状态变更
- **WHEN** 智能体（Agent）修改已初始化工作空间（Workspace）的 Buildr 源资产、内置能力或运行时投射（Runtime Projection）
- **THEN** 对应维护能力 MUST 核对该动作负责的结果并取得适用的最终诊断（Doctor）
- **AND** 相关错误仍使该动作结果不成立时 MUST 保留未完成结论，不把整个任务（Task）或无关动作视为禁止执行

#### Scenario: Buildr CLI 安装或刷新
- **WHEN** 用户已授权安装、更新 Buildr，或自举维护者刷新明确的开发入口
- **THEN** 对应维护者 MUST 核对实际入口身份并消费适用诊断（Doctor），自举继续遵循专属维护者的既有边界
- **AND** MUST NOT 将命令可执行冒充安装身份、工作空间（Workspace）采用更新或运行时（Runtime）结果已验证

#### Scenario: Core 与 Skill 的职责
- **WHEN** Buildr 表达维护后的诊断职责
- **THEN** 核心规则（Core Rule）MUST 只承载价值观、权威、授权边界和结果不变量，不复制命令、生命周期或执行时机
- **AND** 资产维护技能（Skill）及专属维护者 MUST 提供适用的诊断（Doctor）消费、恢复与结果说明方法

#### Scenario: 维护动作已返回最终诊断
- **WHEN** 初始化、同步或组件（Component）维护已返回同一目标、来源和运行时的有效最终诊断（Doctor），且相关内容及条件没有后续变化
- **THEN** 智能体（Agent）MUST 直接消费该结果，不为完成、登记或收尾再次执行同一诊断

#### Scenario: 无关诊断缺口
- **WHEN** 诊断（Doctor）报告另一模块或可选能力缺口，而当前动作不消费该事实且可独立证明目标、授权与结果
- **THEN** 智能体（Agent）MUST 保留局部诊断并继续该安全动作
- **AND** MUST NOT 把聚合健康状态或无关缺口作为全局工作许可

#### Scenario: 诊断指向当前危险动作
- **WHEN** 当前动作的目标身份、已观察版本、授权或删除归属无法安全证明
- **THEN** 智能体（Agent）MUST 停止受影响的写入或删除，并保留已有内容和已成立事实
- **AND** MUST NOT 以无关工作可继续为由绕过具体能力的写入前保护
