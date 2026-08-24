## ADDED Requirements

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
