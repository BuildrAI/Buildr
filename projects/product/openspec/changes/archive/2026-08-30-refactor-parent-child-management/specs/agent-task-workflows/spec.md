## REMOVED Requirements

### Requirement: task-manager 必须作为 Parent Task 的薄管理入口
**Reason**: 父子协调退出固定研发与贡献执行链，改由已有任务和可读产物组织工作。
**Migration**: 原记录保留只读；使用任务关系、计划文档与显式父任务完成依据，不再调用旧写入口。

#### Scenario: 旧要求随协调流程退役
- **WHEN** 新的父子管理方式启用
- **THEN** MUST 保留历史内容只读，并停止执行本要求规定的旧协调流程

### Requirement: Agent 必须按 Parent协调 Child独立交付工作
**Reason**: 父子协调退出固定研发与贡献执行链，改由已有任务和可读产物组织工作。
**Migration**: 原记录保留只读；使用任务关系、计划文档与显式父任务完成依据，不再调用旧写入口。

#### Scenario: 旧要求随协调流程退役
- **WHEN** 新的父子管理方式启用
- **THEN** MUST 保留历史内容只读，并停止执行本要求规定的旧协调流程

### Requirement: Agent 必须显式 reconcile 范围变化
**Reason**: 父子协调退出固定研发与贡献执行链，改由已有任务和可读产物组织工作。
**Migration**: 原记录保留只读；使用任务关系、计划文档与显式父任务完成依据，不再调用旧写入口。

#### Scenario: 旧要求随协调流程退役
- **WHEN** 新的父子管理方式启用
- **THEN** MUST 保留历史内容只读，并停止执行本要求规定的旧协调流程

### Requirement: Agent必须按标准Parent启动流程推进到Child之前
**Reason**: 父子协调退出固定研发与贡献执行链，改由已有任务和可读产物组织工作。
**Migration**: 原记录保留只读；使用任务关系、计划文档与显式父任务完成依据，不再调用旧写入口。

#### Scenario: 旧要求随协调流程退役
- **WHEN** 新的父子管理方式启用
- **THEN** MUST 保留历史内容只读，并停止执行本要求规定的旧协调流程

### Requirement: Agent必须在一对多Child拆分前reconcile Contribution
**Reason**: 父子协调退出固定研发与贡献执行链，改由已有任务和可读产物组织工作。
**Migration**: 原记录保留只读；使用任务关系、计划文档与显式父任务完成依据，不再调用旧写入口。

#### Scenario: 旧要求随协调流程退役
- **WHEN** 新的父子管理方式启用
- **THEN** MUST 保留历史内容只读，并停止执行本要求规定的旧协调流程

### Requirement: Agent workflow 必须使用 Parent Plan v2 并分离预计与真实 Child
**Reason**: 父子协调退出固定研发与贡献执行链，改由已有任务和可读产物组织工作。
**Migration**: 原记录保留只读；使用任务关系、计划文档与显式父任务完成依据，不再调用旧写入口。

#### Scenario: 旧要求随协调流程退役
- **WHEN** 新的父子管理方式启用
- **THEN** MUST 保留历史内容只读，并停止执行本要求规定的旧协调流程

### Requirement: Agent workflow 必须只使用Parent Coordination v3
**Reason**: 父子协调退出固定研发与贡献执行链，改由已有任务和可读产物组织工作。
**Migration**: 原记录保留只读；使用任务关系、计划文档与显式父任务完成依据，不再调用旧写入口。

#### Scenario: 旧要求随协调流程退役
- **WHEN** 新的父子管理方式启用
- **THEN** MUST 保留历史内容只读，并停止执行本要求规定的旧协调流程

## ADDED Requirements

### Requirement: 智能体必须使用轻量父子管理方法
智能体（Agent）MUST 围绕目标、计划文档和真实子任务结果持续推进，按需要组合任务、文档、Git及专业工具，不重建固定父计划链。父任务完成 MUST 引用当前会话内明确用户授权，不能以子任务授权、实现授权或自己生成的说明替代。

#### Scenario: 创建并准备父任务
- **WHEN** 用户要求组织多个独立目标
- **THEN** MUST 维护目标与计划，在已有授权内推进，不强制创建环境、研发记录或专用贡献。

#### Scenario: 完成子任务
- **WHEN** 用户仅授权一个子任务收尾
- **THEN** MUST 只处理该子任务，父任务保持独立。

#### Scenario: 技能修改
- **WHEN** 父子管理入口更新
- **THEN** MUST 同步 task-manager、task-triage、task-development、task-finish 等实际消费者，不把旧链藏入技能。
