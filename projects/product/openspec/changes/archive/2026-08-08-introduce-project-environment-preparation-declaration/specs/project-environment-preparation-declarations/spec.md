## ADDED Requirements

### Requirement: Project必须能够声明环境准备Recipe
已登记Project MUST可以在Project根提供可选`preparation.yml`，且存在时MUST使用closed `buildr.project-environment-preparation/v1`。每个Environment Preparation Recipe MUST具有Project内稳定id、明确Project或单一Service scope、至少一个通用Preparation Step与required布尔值；声明MUST NOT保存Task、runtime、Receipt、secret或机器状态。

#### Scenario: Project-only Recipe
- **WHEN** Project没有Service且声明一个Project-scoped Recipe
- **THEN** Recipe的cwd、inputs、outputs与Project wrapper MUST相对Project execution root解析
- **AND** Task Environment MUST能够为Project-only Task选择并执行该Recipe

#### Scenario: 多Service分别声明
- **WHEN** Project为`buildr`与`buildr-web`分别声明Service-scoped Recipe
- **THEN** 每个Recipe MUST拥有独立identity、Steps与readiness
- **AND** 一个Service失败 MUST不能被另一个Service的ready事实掩盖

#### Scenario: 非Node wrapper
- **WHEN** Recipe使用Project或Service内真实wrapper准备Python、Go、Rust或其他环境
- **THEN** Declaration MUST只保存通用executable、args、inputs、outputs与timeout事实
- **AND** Buildr MUST不把wrapper解释为内置技术栈adapter

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
