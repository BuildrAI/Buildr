# native-session-association Specification

## Purpose

为 Buildr 任务与不同提供者的原生会话（Session）建立可查看、解除和准确打开的多对多关系，保持各提供者连接与历史的权威边界，并完整兼容已交付 Codex 文件、编号、版本与入口。

## ADDED Requirements

### Requirement: 提供者明确的多对多关联

系统 MUST 支持一个任务多个 Codex 或 DSH 会话（Session）、一个会话多个任务。关系 MUST 固定提供者、工作空间、任务、连接和原生编号，相同登记幂等。查询 MUST 不启动模型、发送聊天或复制历史。新任务默认关联 MUST 使用本次执行准确原生身份；无身份不猜桌面焦点，关联失败不否定任务已创建。

#### Scenario: 多品牌关系
- **WHEN** 同一任务登记 Codex 和 DSH 关系
- **THEN** 系统 MUST 保留准确关系并分品牌显示，不混淆同名编号

#### Scenario: 当前工作创建任务
- **WHEN** DSH 执行环境提供本次准确原生编号并新建任务
- **THEN** 智能体 MUST 按已确认连接默认关联，不使用全局焦点

### Requirement: 兼容旧数据与局部失败

Codex 原关系文件、保留字段、编号和版本、命令和接口（API）MUST 保持兼容，不强制迁移。DSH MUST 使用独立关系文件。统一查询 MUST 聚合真实关系，单方失败明确诊断并保留另一方结果，不表达成完整空列表。

#### Scenario: 旧 Codex 文件
- **WHEN** 查询或维护含旧关系和保留字段的文件
- **THEN** 原编号、版本及无关字段 MUST 保持，旧入口可用

#### Scenario: 单方失败
- **WHEN** DSH 关系不可读而 Codex 可读
- **THEN** 系统 MUST 返回 Codex 关系及 DSH 诊断，不阻断 Codex

### Requirement: 按关系版本解除与打开

解除和打开 MUST 用提供者、关系编号及已观察版本核对；失配明确冲突。解除 MUST 只移除关系，不删除任务、聊天或配置。Codex 深链保持；DSH MUST 委托关系的已确认连接并取得准确目标回执，不能把发送成功当作已打开。移除接入 MUST 保留关系，打开明确不可用。

#### Scenario: 旧版本
- **WHEN** 用户按旧版本解除或打开
- **THEN** 系统 MUST 拒绝，不操作其他关系

#### Scenario: 解除
- **WHEN** 按当前版本解除一条关系
- **THEN** 仅该关系 MUST 移除，任务和原生聊天保持

#### Scenario: 移除接入后
- **WHEN** 接入移除但长期关系存在
- **THEN** 关系 MUST 可查看和解除，打开报告不可用
