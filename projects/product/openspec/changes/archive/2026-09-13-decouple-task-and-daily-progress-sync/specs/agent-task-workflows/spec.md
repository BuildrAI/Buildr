## REMOVED Requirements

### Requirement: task-triage 必须在正式 Task 创建前收敛逐repository权威基线
**Reason**: 用户已确认移除强制同步前置，旧成功和失败条件整体由下方独立动作要求替代。
**Migration**: 保留现有记录与 Git 现场；只有实际目标需要代码更新时才独立调用已选 Git 提供者。

## ADDED Requirements

### Requirement: task-triage 必须分离任务登记与代码更新
Agent MUST 在创建或激活任务前确认用户目标、目标工作空间、任务范围、已有匹配记录与写入授权，更新已有记录时 MUST 使用已观察版本。任务登记 MUST NOT 以 Git 更新、干净工作目录、集成分支、上游引用、Git 提供者或全局 Doctor 就绪为前置。代码更新与后续专业动作 MUST 按实际用户目标及当前事实独立选择；登记成功 MUST NOT 被解释为代码、环境、验证或交付已经就绪。

#### Scenario: 仅登记或激活任务
- **WHEN** 任务目标、范围和授权明确，记录输入合法
- **THEN** Agent MUST 直接创建或激活任务，MUST NOT 为登记执行 fetch、rebase 或工作空间同步

#### Scenario: 本地存在未提交内容或进行中的 Git 操作
- **WHEN** 合法任务登记范围内存在未提交内容或进行中的 Git 操作
- **THEN** Agent MUST 保留 Git 现场并允许记录写入
- **AND** 后续代码修改 MUST 独立核对归属和冲突，无法安全执行时只暂停对应动作

#### Scenario: 离线或上游无法解析
- **WHEN** 网络不可用、上游缺失或集成分支无法唯一解析，但记录目标与范围明确
- **THEN** Agent MUST 允许合法登记，MUST NOT 猜测 dev 或修改分支与上游

#### Scenario: Git 提供者不可用
- **WHEN** optional Git Operations 提供者不可用且当前只需任务登记
- **THEN** Agent MUST 使用可用的任务记录提供者完成合法登记，不将 Git 依赖提升为必需

#### Scenario: 用户另行要求更新代码
- **WHEN** 用户目标确实需要更新明确仓库与引用，并且相应授权成立
- **THEN** Agent MUST 使用已选 Git Operations 提供者独立执行并保留实际结果
- **AND** 更新失败 MUST NOT 撤销已成立的任务登记或扩大为无关记录写入的阻塞

#### Scenario: 登记自身条件不成立
- **WHEN** 任务目标、范围、授权或记录版本不明确，或记录输入非法
- **THEN** Agent MUST 停止对应记录写入并说明最小缺口
