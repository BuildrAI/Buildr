# project-declaration-intake Specification

## Purpose

为Project环境准备与任务验证声明提供统一Agent接入流程，定义注册、首次Task和专业缺口触发后的只读发现、精确长期写入授权、各声明owner handoff及无持久状态边界。

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
Project/Service注册、首次Task scope、构建/依赖/测试入口变化、Environment declaration gap、Verification coverage gap及显式initialize/refresh MAY触发Intake。触发后Agent MUST先只读发现并展示候选或diff；任何长期声明写入 MUST先取得用户对目标文件与内容的确认。

#### Scenario: 用户未授权写入
- **WHEN** Intake已形成声明候选但用户未确认
- **THEN** Agent MUST报告当前缺口和候选
- **AND** MUST不创建、更新或删除任何声明文件

#### Scenario: 用户授权写入
- **WHEN** 用户确认Preparation或Verification声明的精确长期变更
- **THEN** Intake MUST把动作交给对应声明owner Skill
- **AND** owner MUST使用自己的schema、模板和Doctor校验

### Requirement: Intake必须把外部能力缺口交还原体系
Intake发现缺少Skill/provider时 MUST交给Capability体系，发现缺少CLI时 MUST交给Commands/Doctor。Intake MUST不安装或修改Skill、provider、CLI、runtime或测试框架。

#### Scenario: 非Node wrapper依赖外部CLI
- **WHEN**候选Preparation Recipe引用Project或Service wrapper但其CLI requirement不ready
- **THEN** Intake MUST报告Commands诊断并保持候选未落盘或blocked
- **AND** MUST不新增技术栈adapter或从ambient PATH选择工具
