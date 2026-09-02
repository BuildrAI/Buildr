# project-environment-preparation-declarations Specification

## Purpose

定义 Project 环境准备声明、Recipe scope、closed Step、identity、Doctor 与 Agent 选择边界。

## Requirements

### Requirement: Project必须能够声明环境准备Recipe

Project MAY通过`preparation.yml`声明Project/Service真实准备入口，供Agent按需发现并直接调用。声明 MUST不形成Task Plan、Receipt、ready状态或Application执行授权；没有额外准备的Project MAY不提供该文件。

#### Scenario: Project无需额外准备
- **WHEN** Project真实构建入口不要求额外依赖或代码生成
- **THEN** Agent MUST直接继续，不创建空Plan或声明

#### Scenario: Project声明准备入口
- **WHEN** Agent当前动作需要安装依赖或生成代码
- **THEN** Agent MUST从matching Project/Service根调用声明的真实入口
- **AND** Buildr MUST不保存Task选择或执行结果

#### Scenario: Project-only Recipe
- **WHEN** Project只有Project-wide准备入口
- **THEN** Agent MAY在Project根按需调用，不要求虚构Service或Task Plan

#### Scenario: 多Service分别声明
- **WHEN** 多个Service具有不同准备入口
- **THEN** 声明 MUST分别限定Service root、cwd和真实wrapper

#### Scenario: 非Node wrapper
- **WHEN** Project使用Maven、Python、Go、Rust或其他工具
- **THEN** Buildr MUST保留声明的真实入口，不推断Node或通用适配器

### Requirement: Preparation Declaration必须保持closed和owner-scoped
Preparation Declaration MUST只允许已登记Project及其Service、规范化Project/Service相对路径、受支持executable来源和无shell Steps。Buildr MUST NOT递归扫描manifest来生成Recipe，也 MUST NOT因声明缺失而虚构not-applicable或安装命令。

#### Scenario: 声明包含越界或未知字段
- **WHEN** `preparation.yml`包含scope外Service、路径逃逸、shell、env、secret、stdin或未知字段
- **THEN** parser与Doctor MUST返回具体invalid diagnostic
- **AND** MUST不执行任何Step或修复声明

#### Scenario: 声明缺失
- **WHEN** 已登记Project没有`preparation.yml`
- **THEN** Doctor MUST保持零error且报告声明absent或not-applicable read model
- **AND** Environment MUST要求Agent选择显式task-inline fallback或先经授权建立声明

### Requirement: Declaration与Recipe必须具有内容identity
Application MUST按规范化closed值计算Declaration identity与每个Recipe identity。identity MUST绑定scope、required、executable、args、cwd、inputs、outputs与timeout；注释或YAML排版变化 MAY只改变bytes identity而不改变规范化Recipe identity，但Plan MUST同时绑定声明来源identity与Recipe identity。

#### Scenario: Recipe内容漂移
- **WHEN** 已选Recipe的Step input、command、scope或output声明变化
- **THEN** 旧Task Plan与Receipt MUST派生为stale/blocked
- **AND** Agent MUST重新提交当前Recipe选择后才能恢复prepare

### Requirement: Preparation缺口必须提供Declaration Intake恢复入口

Declaration Intake MAY只读指出Project preparation声明缺失、失效或与真实入口不一致；它 MUST不阻塞无关开发动作，也不得把缺口写成Task Environment blocker。

#### Scenario: 声明缺失但当前动作不需要准备
- **WHEN** Agent能够直接编辑、审查、验证或交付且无需该准备入口
- **THEN** 声明缺口 MUST不阻塞当前动作

#### Scenario: Recipe缺失
- **WHEN** 当前动作明确需要的Recipe不存在
- **THEN** 只依赖该Recipe的动作 MUST停止并指向Declaration Intake

#### Scenario: 声明缺失
- **WHEN** Project没有`preparation.yml`且Agent无法确定必要准备入口
- **THEN** Declaration Intake MUST报告事实缺口，不创建Environment blocker
