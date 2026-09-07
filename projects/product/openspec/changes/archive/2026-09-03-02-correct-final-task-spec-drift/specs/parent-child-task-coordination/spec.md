## ADDED Requirements

### Requirement: 父任务协调必须围绕目标与真实任务成果
Buildr MUST复用任务记录保存目标、范围、直接关系与独立结果；计划由可读文档或目标说明表达。智能体（Agent）MUST核对当前计划和成果后决定分工、依赖与接续；产品 MUST不建立计划数据库、自动调度链或把子任务计数当目标完成比例。

#### Scenario: 纯协调父任务
- **WHEN** 父任务只组织工作，没有代码执行需求
- **THEN** MUST能建立父任务、查看子任务和维护目标，无需环境、研发回执、审查采用或贡献绑定

#### Scenario: 独立子任务
- **WHEN** 工作具有独立目标、范围和可验收成果
- **THEN** MUST可建立真实子任务；临时智能体分工不自动建子任务

#### Scenario: 范围变动
- **WHEN** 一批子任务结束但总体仍有未完成目标
- **THEN** MUST保持总体目标和父任务未完成，不自动缩小范围

### Requirement: 父任务协调查询必须读取真实结果并隔离历史错误
父任务协调查询 MUST展示父任务目标、直接子任务目标及真实结果、完成观察身份和完成依据；MUST不从状态推断机器交付。旧父计划只作历史查看，读取不得写入或运行专业准备。

#### Scenario: 普通父任务关系
- **WHEN** 父任务没有旧专用计划但有子任务
- **THEN** MUST返回完成保护及子任务成果摘要

#### Scenario: 历史数据损坏
- **WHEN** 旧父计划损坏
- **THEN** MUST保留可读任务结果并局部报告历史异常
- **AND** MUST不清除已保存父身份或真实子关系的完成保护

### Requirement: 旧父任务协调写入口必须退役并保全必要历史
旧父计划写入口、贡献绑定、审查采用、贡献登记和专用验收写入口 MUST退役。`legacy_parent_plan_json` MAY仅作为明确历史展示保留，但 MUST不决定当前父身份、完成授权、snapshot或Task状态。没有受支持读取者的旧贡献协调表和解析代码 MUST不存在。

#### Scenario: 旧命令调用
- **WHEN** 调用旧`task parent record`或其他退役写动作
- **THEN** MUST按不存在的接口处理且零写入
- **AND** MUST不提供兼容转发

#### Scenario: 查看历史
- **WHEN** Parent inspect读取保留的旧Parent Plan
- **THEN** MUST只返回明确历史展示
- **AND** MUST不要求补证据或重新执行研发

## REMOVED Requirements

### Requirement: 父子协调必须围绕目标与真实任务成果
**Reason**: 当前统一使用父任务协调术语。
**Migration**: 行为不变，使用新Requirement名称。

### Requirement: 父子摘要必须读取真实结果并隔离历史错误
**Reason**: 当前统一使用父任务协调查询术语，且旧交接不再是读取对象。
**Migration**: 使用父任务协调查询Requirement。

### Requirement: 旧父子协调写入口必须退役并保全历史
**Reason**: 当前统一使用父任务协调术语，旧贡献协调数据已经删除。
**Migration**: 只保留`legacy_parent_plan_json`历史展示。
