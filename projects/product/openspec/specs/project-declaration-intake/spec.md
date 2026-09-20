# project-declaration-intake Specification

## Purpose

为项目准备入口与测试地图提供智能体（Agent）接入流程，定义注册、首次任务和专业缺口触发后的只读发现、真实根及范围核对、长期写入授权和声明维护者交接；接入流程不保存状态，也不执行测试。

## Requirements

### Requirement: Declaration Intake必须只编排Preparation与Verification声明
Buildr MUST提供Agent Declaration Intake入口，只管理已登记Project根的`preparation.yml`与`verification.yml`。Intake MUST不拥有统一schema、store、writer、Task Result或Environment Receipt，也 MUST不把`capabilities.yml`和`commands.yml`纳入声明写入。

#### Scenario: Project-only scope
- **WHEN** 用户首次在没有Service的Project开始Task
- **THEN** Intake MUST只读检查Project scope的Preparation与Verification事实
- **AND** MUST不虚构Service或技术栈适配器

#### Scenario: 多Service scope
- **WHEN** Task或注册事件包含多个Services
- **THEN** Intake MUST分别列出各Service对Preparation Recipe与Verification scope的候选或差异
- **AND** MUST不把一个Service的事实复制到另一个Service

### Requirement: 自动触发必须止于只读发现
Project/Service注册、首次Task scope、构建/依赖/测试入口变化、Environment declaration gap、Verification coverage gap及显式initialize/refresh MAY触发Intake。触发后Agent MUST先只读发现并展示候选或diff，再将变化分类为`routine-maintenance`或`user-decision-required`。仅让声明追上当前用户目标内已确认入口、且不改变Project/Service scope、applicability、required capability、外部效果或安全例外的维护 MAY 由Agent交给对应owner完成；改变任一长期适用性或存在authority冲突的变化 MUST先取得用户对精确目标与内容的确认。

#### Scenario: 既有scope内的routine maintenance
- **WHEN** Intake发现声明只需追上当前Task scope内已由wrapper、lockfile、测试入口或既有权威事实确认的变化
- **AND** 该diff不新增或删除scope、不改变applicability/requiredness、不引入capability、外部效果或安全例外
- **THEN** Agent MAY在当前用户目标授权内把精确diff交给对应声明owner写入并验证
- **AND** MUST报告changed file、identity与owner验证结果，而不要求用户承担内部声明维护步骤

#### Scenario: 用户未授权写入
- **WHEN** 候选会新增或删除Project/Service scope、改变applicability或requiredness、引入新的capability/外部效果/安全例外，或权威证据存在冲突
- **THEN** Intake MUST展示精确目标文件、语义差异、影响和未决项并请求用户确认
- **AND** 在确认前 MUST不创建、更新或删除声明文件

#### Scenario: 用户授权写入
- **WHEN** 用户确认Preparation或Verification声明的精确长期适用性变化
- **THEN** Intake MUST把动作交给对应声明owner Skill
- **AND** owner MUST使用自己的schema、模板和Doctor校验

### Requirement: Intake必须把外部能力缺口交还原体系
Intake发现缺少Skill/provider时 MUST交给Capability体系，发现缺少CLI时 MUST交给Commands/Doctor。Intake MUST不安装或修改Skill、provider、CLI、runtime或测试框架。

#### Scenario: 非Node wrapper依赖外部CLI
- **WHEN**候选Preparation Recipe引用Project或Service wrapper但其CLI requirement不ready
- **THEN** Intake MUST报告Commands诊断并保持候选未落盘或blocked
- **AND** MUST不新增技术栈adapter或从ambient PATH选择工具

### Requirement: Verification Intake 必须发现当前测试地图候选
Declaration Intake MUST只读检查真实测试源码、构建配置、scripts、CI、module、Tag、Suite和项目／服务登记，形成当前`buildr.project-verification/v4`测试地图候选及精确diff。候选 MUST分别说明`scope`、路径根绑定、`purpose`、`sourcePaths`、`testRoots`、完整`full`入口、可选`selection`和`requirements`；MUST不要求已退役的`proves`、`evidence`、`usable targets`、`discovery`或独立affected入口字段，不得把文件清单或一次性Plan落入声明。

#### Scenario: 发现 Maven Service 能力
- **WHEN** Service已有稳定Maven profile、测试源码和Tag
- **THEN** Intake MUST展示由这些authority支持的测试族候选及缺失事实
- **AND** MUST NOT仅按技术栈或目录名推断证明范围、完整入口覆盖或选择安全性

#### Scenario: Service 代码位于 Project 目录之外
- **WHEN** 测试族的源码、测试和命令属于已登记的外部Service代码根
- **THEN** Intake MUST形成使用该Service code的`location`候选，并让声明owner校验当前解析位置
- **AND** MUST分别说明证明覆盖的`scope`与路径根，不得以`scope.services`隐式选择执行目录

### Requirement: 旧声明迁移必须由真实测试事实重建当前地图
当受控Project仍有旧版声明且用户已授权本次迁移时，Intake MUST结合真实代码和入口生成到当前v4测试地图的精确语义diff并交给声明owner；旧字段 MUST仅作为调查线索，不得机械改版本号或恢复旧执行模型。不能由事实证明的路径根、证明范围、完整入口或选择指导 MUST作为未决项或测试建设缺口，不得通过默认值伪造。

#### Scenario: 旧invocation只能证明full
- **WHEN** 旧capability只有一个稳定命令且没有可信affected selector
- **THEN** migration MUST核对该命令实际覆盖的测试范围后登记为对应测试族的`full`入口，并在`selection`中说明可用选择方式或完整执行的依据
- **AND** MUST NOT复制命令为已退役的affected声明入口，或宣称未证明的受影响选择能力

#### Scenario: 未授权Workspace
- **WHEN** 发现不在本次受控范围内的旧版声明
- **THEN** Intake MUST报告待迁移事实与目标文件
- **AND** MUST NOT跨Workspace或跨Git authority直接写入
