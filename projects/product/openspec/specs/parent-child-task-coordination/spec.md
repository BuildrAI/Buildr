# parent-child-task-coordination Specification

## Purpose

定义 Parent Plan、Contribution、Contribution Handoff、显式 reconciliation、派生 read model、最终集成验收与历史 opt-in 兼容模型。

## Requirements

### Requirement: 父子协调必须围绕目标与真实任务成果
Buildr MUST 复用任务记录保存目标、范围、直接关系与独立结果；计划由可读文档或目标说明表达。智能体（Agent）MUST 核对当前计划和成果后决定分工、依赖与接续；产品 MUST NOT 建立计划数据库、自动调度链或把子任务计数当目标完成比例。

#### Scenario: 纯协调父任务
- **WHEN** 父任务只组织工作，没有代码执行需求
- **THEN** MUST 能建立父任务、查看子任务和维护目标，无需环境、研发回执、审查采用或贡献绑定。

#### Scenario: 独立子任务
- **WHEN** 工作具有独立目标、范围和可验收成果
- **THEN** MUST 可建立真实子任务；临时智能体分工不自动建子任务。

#### Scenario: 范围变动
- **WHEN** 一批子任务结束但总体仍有未完成目标
- **THEN** MUST 保持总体目标和父任务未完成，不自动缩小范围。

### Requirement: 父任务完成必须是独立授权动作
父任务 MUST 依据整体目标验收，并取得指向该父任务的明确用户完成授权。子任务完成、全部终态、验收、实现授权或未指明父任务的收尾 MUST NOT 自动授权完成；嵌套任务 MUST 逐层独立处理。

#### Scenario: 没有授权
- **WHEN** 子任务全部完成但用户没有授权完成父任务
- **THEN** MUST 保持父任务状态，报告可审阅的验收结果。

#### Scenario: 嵌套父任务
- **WHEN** 一个同时作为上级子任务的父任务完成
- **THEN** MUST NOT 递归完成上级或其他子任务。

### Requirement: 父子摘要必须读取真实结果并隔离历史错误
父子摘要 MUST 展示父任务目标、直接子任务目标及真实结果、完成观察身份和完成依据；MUST 不从状态推断机器交付。旧父计划和交接只作历史查看，读取不得写入或运行专业准备。

#### Scenario: 普通父子关系
- **WHEN** 父任务没有旧专用计划但有子任务
- **THEN** MUST 返回与显式父任务相同的完成保护及子任务成果摘要。

#### Scenario: 历史数据损坏
- **WHEN** 旧研发或收尾记录损坏
- **THEN** MUST 保留可读任务结果并局部报告历史异常；MUST 不因历史损坏清除已保存父身份或真实子关系的完成保护。

### Requirement: 旧父子协调写入口必须退役并保全历史
旧父计划、贡献绑定、审查采用、贡献登记和专用验收写入口 MUST 退役；既有计划、贡献和任务数据 MUST 保留只读。不得创建长期双轨或批量改写历史任务状态。

#### Scenario: 旧命令调用
- **WHEN** 调用旧 task parent record 或其他退役写动作
- **THEN** MUST 零写入返回退役说明，指向已有任务与文档操作。

#### Scenario: 查看历史
- **WHEN** 读取原父计划及交接
- **THEN** MUST 不要求补新证据或重新执行研发。
