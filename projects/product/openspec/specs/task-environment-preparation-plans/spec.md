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
每个`required` Service Plan MUST包含至少一个required Preparation Step。Step MUST声明稳定id、Service-relative cwd、无shell executable来源、字符串args、有界timeout、Service-relative input files、Service-relative expected outputs与required；Task Environment MUST只解释通用执行和文件事实，MUST NOT解释npm、Python、Cargo、Maven或其他技术栈语义，也不得为全部scope建立Node runtime前置。

#### Scenario: Workspace Foundation工具步骤
- **WHEN** Agent在某个Project/Service Recipe中显式声明`workspace-foundation` executable及名称`npm`
- **THEN** Environment MUST从当前受控执行环境解析该命令的绝对executable并记录identity
- **AND** executable缺失或后续漂移 MUST只阻塞引用它的Step和scope
- **AND** 未引用该工具的scope MUST不生成Node/npm runtime probe

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

### Requirement: Agent必须从Project声明选择Task Preparation Plan
Buildr MUST允许Agent提交closed `buildr.task-environment-plan-request/v1`，按active Task完整Project/Service scope选择Project `preparation.yml`中的Recipe，并由Task Environment Application生成`buildr.task-environment-plan/v2`执行快照。Plan MUST保存声明path/identity、Recipe id/identity、scope coverage、selection reason与规范化Step快照；MUST NOT主要依赖Agent重新抄写声明Step。

#### Scenario: Product多Service选择
- **WHEN** Task scope包含`product/buildr`与`product/buildr-web`且Agent分别选择两个Service Recipe
- **THEN** Plan MUST保存两个scope、两个Recipe identity与各自Step
- **AND** Receipt MUST逐Recipe与Step报告readiness

#### Scenario: Project-only选择
- **WHEN** Task只有Project scope且Agent选择Project Recipe
- **THEN** Plan MUST执行Project-relative Steps而不是强制not-applicable
- **AND** Task Environment MUST不要求建立虚假Service

#### Scenario: scope覆盖不完整
- **WHEN** Selection Request遗漏Task Project/Service scope、选择scope外Recipe或重复覆盖scope
- **THEN** Plan mutation MUST零写入blocked并指出selector
- **AND** MUST不扫描仓库或自动补选Recipe

### Requirement: Task-inline Plan必须是显式fallback
声明缺失或Task有一次性准备需求时，Buildr MUST允许Agent提交`task-inline`来源的Plan Request，其中包含完整scope coverage、Recipe与Steps。Receipt MUST明确标记无持久Project declaration来源并提供持久化next action；Buildr MUST不静默创建或更新`preparation.yml`。

#### Scenario: 首次Task使用task-inline
- **WHEN** Project没有Preparation Declaration且Agent已明确判断准备Steps
- **THEN** `prepare --plan` MUST能够形成v2 Task Plan并执行
- **AND** CLI与Buildr Web MUST将来源显示为`task-inline`

### Requirement: Plan替换必须绑定当前声明
Plan record与`prepare --plan` MUST在mutation前从Task Environment拥有的execution root读取当前声明，验证Project ownership、path、Declaration identity与Recipe identity，并原子替换同一SQLite current中的Plan。任何验证失败 MUST保留旧Plan/Receipt；Plan record MUST不执行Step。

#### Scenario: 调用方提交旧声明identity
- **WHEN** Selection Request中的Declaration或Recipe identity与当前worktree不一致
- **THEN** mutation MUST返回stale/blocked和当前identity
- **AND** MUST不保存调用方旧快照或执行旧命令

### Requirement: Environment Plan 必须闭合基础准备与capability辅助准备
新Task Environment Plan MUST分别保存恰好覆盖Task scope的基础选择，以及由selected Verification capability declarations确定的辅助准备要求。辅助要求 MUST绑定capability identity、Project、scope、Recipe identity与选择理由；MUST NOT改变Task Record scope、Change applicability、Content Target或源码写入所有权。

#### Scenario: Task scope不含辅助Service
- **WHEN** Task只包含`service:product/buildr`，selected Browser capability要求`service:product/buildr-web` Recipe
- **THEN** Plan MUST保留`buildr`基础scope并将`buildr-web`记录为auxiliary preparation scope
- **AND** MUST不要求Task Record增加`product/buildr-web`或允许任务修改其deliverable source

#### Scenario: selected capability集合变化
- **WHEN** current selected capability identities或其preparation references发生变化
- **THEN** Plan closure identity MUST变化并使不匹配的辅助准备事实stale
- **AND** 后续prepare MUST只执行新增、缺失或漂移的Recipe Steps

### Requirement: Plan中的Workspace路径必须具有显式基准
新Plan writer MUST把Recipe和task-inline Step的cwd、inputs与outputs规范化为closed typed path reference，基准只能是`workspace|project|service|step`并包含解析所需selector。执行前 MUST校验相对path、realpath、symlink、scope与越界；不得依赖进程cwd或Agent解释。

#### Scenario: Project declaration的scope-relative字符串
- **WHEN** 现有v1 Service Recipe包含`cwd: .`与相对inputs/outputs
- **THEN** Plan compiler MUST根据Recipe scope规范化为同一Service base的typed references
- **AND** Receipt diagnostic MUST能够报告base、selector和relative path

#### Scenario: task-inline输入没有路径基准
- **WHEN** 新task-inline Plan Request提交无法确定base的相对路径
- **THEN** closed schema MUST在保存Plan或执行Step前拒绝
- **AND** MUST不把调用进程cwd、Project root或Service root作为猜测fallback

#### Scenario: typed path解析越界
- **WHEN** path reference经规范化或realpath后逃逸其声明base
- **THEN** Plan mutation或prepare MUST零执行blocked并指出base与相对path
- **AND** MUST不尝试其他base或继续执行同Recipe的命令

### Requirement: Plan必须以closed authority引用executable
新Plan writer MUST把Step executable规范化为closed executable authority reference，且只能选择受管`runtime`、`workspace-foundation`、`service-wrapper`或现有兼容模型中显式授权的machine executable requirement。Workspace Foundation与machine executable MAY解析到Workspace外的当前机器绝对路径，但该路径 MUST只作为Receipt observation保存；Project/Service wrapper MUST保持在所属execution root内。Buildr MUST NOT把executable强塞进Workspace path base、从ambient PATH猜测fallback或把机器绝对路径写入portable declaration。

#### Scenario: 精确runtime位于Workspace外
- **WHEN** Product声明的精确development Node由Workspace Foundation解析到用户机器的受管工具目录
- **THEN** Plan MUST保存foundation/runtime authority与portable requirement
- **AND** Receipt MUST保存当前机器解析的executable、identity与source，而不要求该路径属于Workspace base

#### Scenario: Service wrapper逃逸execution root
- **WHEN** Service wrapper authority经realpath解析后逃逸所属Service execution root
- **THEN** Plan mutation或prepare MUST在执行前blocked
- **AND** MUST不改用PATH同名工具或把该wrapper降级为machine executable
