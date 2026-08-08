# task-environment-preparation-plans Specification

## Purpose

定义 Agent 如何依据当前正式 Task 的完整 Service scope、构建与验证事实，登记可审计的多 Service、多步骤环境准备计划，并约束通用步骤执行、显式不适用、漂移恢复与只读检查边界。

## Requirements

### Requirement: Agent 必须为当前 Task 声明完整的 Environment Preparation Plan
Buildr MUST允许Agent为一个active正式Task登记closed `buildr.task-environment-plan/v1`。Task有Service scope时，Plan MUST恰好覆盖每个Task-scoped Service并为其声明`required`或`not-applicable`；Task没有Service scope时，Plan MUST以非空`notApplicableReason`显式声明无需Service技术准备。Task Environment MUST NOT从空数组、package manifest、目录、Project技术栈配置或未知文件推断缺失声明。

#### Scenario: 多 Service Task 声明准备计划
- **WHEN** Task scope包含`service:product/buildr`与`service:product/buildr-web`，Agent为两者分别登记Service Plan
- **THEN** Task Environment MUST在同一个Plan中保存两个Service及各自步骤
- **AND** MUST逐Service、逐Step聚合readiness，而不是复制一份全局probe

#### Scenario: Task scope没有完整覆盖
- **WHEN** Plan遗漏任一Task-scoped Service、重复声明Service或包含Task scope外Service
- **THEN** Plan mutation MUST零写入返回blocked并指出selector
- **AND** Agent MUST先通过Task Record Application明确调整scope，Task Environment不得自行扩大scope

#### Scenario: Service明确无需准备
- **WHEN** Agent判断某Task-scoped Service没有需要Environment执行的准备步骤
- **THEN** Agent MUST登记`not-applicable`与非空reason
- **AND** Task Environment MUST不因未识别package manifest而自动形成该结论

#### Scenario: 没有Service scope的Task
- **WHEN** Task只包含Workspace或Project scope且Agent判断无需Service技术准备
- **THEN** Plan MUST使用非空`notApplicableReason`并保持services为空
- **AND** 缺少reason的空Plan MUST返回blocked而不是ready

#### Scenario: 首次没有Plan
- **WHEN** 新Task Environment执行prepare且未携带Plan、current也没有已保存Plan
- **THEN** Environment MAY准备受控execution roots与只读调查所需foundation，但 MUST返回`blocked / task_environment_plan_missing`
- **AND** MUST不执行任何技术栈准备命令或报告ready

### Requirement: Service Plan 必须由通用 Preparation Steps 构成
每个`required` Service Plan MUST包含至少一个required Preparation Step。Step MUST声明稳定id、Service-relative cwd、无shell executable来源、字符串args、有界timeout、Service-relative input files、Service-relative expected outputs与required；Task Environment MUST只解释通用执行和文件事实，MUST NOT解释npm、Python、Cargo、Maven或其他技术栈语义。

#### Scenario: Workspace Foundation工具步骤
- **WHEN** Agent声明`workspace-foundation` executable及名称`npm`
- **THEN** Environment MUST解析当前Workspace Foundation提供的绝对受管executable并记录identity
- **AND** MUST不从ambient PATH解析同名命令

#### Scenario: Service wrapper步骤
- **WHEN** Agent声明Service-relative executable
- **THEN** Environment MUST只允许解析到该Service execution root内的真实可执行文件
- **AND** 路径越界、缺失、类型错误或根自身为symlink时 MUST在执行前blocked

#### Scenario: Agent选择绝对executable
- **WHEN** Agent声明规范化绝对executable
- **THEN** Environment MUST记录该机器路径与当前identity，并在漂移时阻塞
- **AND** MUST不把该选择升级为Buildr支持某技术栈的全局adapter事实

#### Scenario: Step尝试使用shell或凭证字段
- **WHEN** Plan包含shell文本、环境变量map、secret、stdin payload或未知command字段
- **THEN** closed schema MUST拒绝整个Plan mutation
- **AND** Task Environment Receipt MUST不保存凭证或完整命令输出

### Requirement: Environment Plan 必须支持显式登记、读取和替换
Task Environment Application MUST提供Plan `record`与saved `inspect`，并 MUST允许`prepare`携带Plan一次完成登记和执行。Plan mutation MUST原子替换同一`task_environment_current`中的current Plan，MUST使旧Step results失效，且 MUST不执行准备步骤。

#### Scenario: 先调查execution root再登记
- **WHEN** 首次prepare因plan-missing返回受控execution roots，Agent只读调查后调用Plan record
- **THEN** Application MUST校验Task、Workspace、scope与paths后保存Plan identity
- **AND** 后续prepare MUST只执行该current Plan

#### Scenario: prepare携带Plan
- **WHEN** Agent已能从Task scope和retained源码判断环境要求，并运行`prepare --plan <file>`
- **THEN** Application MUST在同一操作中建立Environment、登记Plan并执行required Steps
- **AND** 全部required facts ready后才返回ready

#### Scenario: Plan改变
- **WHEN** Agent登记的新Plan identity不同于current
- **THEN** Environment MUST保留同一Receipt authority并把旧preparation results标记为stale/blocked
- **AND** MUST不自动执行新命令、合并旧Plan或创建第二份Environment
