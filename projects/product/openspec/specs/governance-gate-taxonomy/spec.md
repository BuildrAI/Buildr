# governance-gate-taxonomy Specification

## Purpose

定义 Buildr 产品硬门禁、待处理与建议的统一分类，约束动作局部作用域、硬门禁八字段记录、安全降级、有界审计清单及代表性基础证明，并明确它们不得成为全局工作许可或第二套运行时 authority。

## Requirements

### Requirement: 产品治理结果分类
Buildr Product MUST 将治理结果区分为硬门禁（Hard Gate）、待处理（Attention）与建议（Advice）。硬门禁只允许用于继续当前具体动作会造成越权、错误对象写入、未经授权或不可逆副作用、覆盖他人工作、证据失真或完成误报的情况；可独立恢复的内部登记、派生证据、自动化信心或无关模块缺口 MUST 表达为 attention 或 advice，不得否定可从权威来源核验的事实。

#### Scenario: 内部登记缺失但事实可独立核验
- **WHEN** Buildr 的内部登记或派生 evidence 缺失，但当前目标事实可以从所属专业 authority 独立核验
- **THEN** Product MUST 保留已核验事实，并将登记恢复限定为 attention 或对应写入动作的局部前置
- **AND** MUST NOT 将其扩大为 Workspace、Task 或 Agent 的全局工作禁令

#### Scenario: 继续动作会造成错误完成结论
- **WHEN** 当前 evidence 与内容 identity 不匹配，继续会把失败、未知、stale 或未执行事实报告为通过或完成
- **THEN** Product MUST blocked 该完成或交付结论
- **AND** MUST NOT 通过 attention、advice 或 claimed success 降级放行

### Requirement: 硬门禁审查模板
Buildr Product 新增、保留或收紧硬门禁时 MUST 明确记录当前 `action`、`consumer`、保护的 `invariant`、放行的具体 `harm`、判断 `authority`、阻塞 `scope`、Buildr 不可用时的安全 `fallback` 与最终 `classification`。任一项无法明确时，该规则 MUST 降级为 attention、advice 或更窄动作的局部前置。

#### Scenario: 门禁缺少具体伤害
- **WHEN** 一个候选门禁只能说明推荐流程未完成，不能说明继续当前动作会破坏什么结果不变量
- **THEN** Product MUST NOT 把它定义为硬门禁
- **AND** MUST 将其表达为 attention、advice 或对应自动化路径的局部前置

#### Scenario: 安全降级不能绕过 authority
- **WHEN** Buildr 的自动化或内部 writer 暂时不可用
- **THEN** fallback MUST 只允许缩小动作范围、停止危险副作用，或改用仍能独立核验同一事实的 authority
- **AND** MUST NOT 允许伪造 Result、绕过授权、改写共享历史或删除 ownership 不明的对象

### Requirement: 动作局部就绪
Buildr Product 的 `ready`、`blocked`、`required` 与 capability readiness MUST 绑定具体 action 和 consumer。一个局部缺口 MUST 只阻止实际消费该事实或能力的动作；Product MUST NOT 使用聚合 `health.ready`、Receipt 完整性或 optional capability readiness 作为所有 Agent 工作的统一许可位。

#### Scenario: 当前恢复动作 required 但无关工作合法
- **WHEN** 当前 Buildr-managed action 缺少 matching Environment Plan、Receipt 或 selected capability
- **THEN** Product MAY 将恢复动作标为 `required`
- **AND** MUST 明确该缺口不证明无关只读调查、直接专业工作或其他不消费该事实的动作非法

#### Scenario: 目标身份不匹配
- **WHEN** consumer 将要写入或执行的目标不属于当前授权或 matching execution roots
- **THEN** Product MUST blocked 该具体写入或执行动作
- **AND** fallback MUST 要求重新解析正确目标或取得新授权，不得回退到 cwd、相似路径或旧 Receipt 猜测

### Requirement: 有界门禁审计清单
Buildr Product MUST 维护一份面向本次治理迁移的有界门禁审计清单，至少标注 gate/source、action、consumer、当前分类、保护的不变量、authority、阻塞范围、安全降级与后续 owner。该清单 MUST 是当前事实与迁移输入，不得成为运行时 registry、第二套规范、完成状态或 Parent progress authority。

#### Scenario: 审计项属于后续模块迁移
- **WHEN** 审计发现某个 Finish、Environment、Development、Doctor 或其他模块的门禁需要重构
- **THEN** 清单 MUST 标注对应 owner/Contribution 与当前判断
- **AND** 本 Change MUST NOT 因审计发现而批量修改所有模块或声称该项已经交付

### Requirement: 代表性基础证明
Buildr Product MUST 以真实专业模块的自动测试证明分类契约可落地，至少覆盖局部硬阻断、attention/无关动作继续和安全降级，同时保持身份、授权、证据真实性与危险副作用的 fail-closed 边界。测试 MUST 断言结果不变量，不得只断言固定 Skill 措辞、文档段落或流程顺序。

#### Scenario: Formal Verification preparation 缺口
- **WHEN** matching Formal Task Environment 缺少 selected capability 所需 preparation
- **THEN** 自动测试 MUST 证明该缺口阻止正式 Verification Result，并提供受控 Environment 恢复输入
- **AND** MUST 证明无关开发不被该缺口阻止

#### Scenario: Task Finish 入口缺口
- **WHEN** Task Finish 同时观察到 Development、Environment 或 Delivery 缺口
- **THEN** 自动测试 MUST 证明 Finish run 不会启动且各模块缺口均被保留
- **AND** MUST NOT 把该失败解释为取消其他已成立的专业事实或 Agent 的全局工作许可
