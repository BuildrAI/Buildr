## MODIFIED Requirements

### Requirement: 正式 Task 必须先取得 ready Task Environment
Buildr MUST只为已经存在的正式Task建立任务环境（Task Environment），并 MUST只在当前动作实际消费Buildr-managed checkout、Preparation、runtime projection、Task-owned持久资源、正式环境证据或cleanup authority时要求matching `ready`。Task Environment MUST NOT把环境事实写入Task Record，也 MUST NOT把Formal Task、编辑、构建或有界测试本身变成通用工作许可；Agent选择直接工作时 MUST如实保留未形成Environment/正式Result的事实。

#### Scenario: 正式 Task 首次进入持久交付
- **WHEN** active Task选择由Buildr准备或拥有的checkout、依赖、runtime projection、持久资源或正式环境证据
- **THEN** Agent MUST先通过selected `buildr.task-environment/v1` provider准备或恢复环境
- **AND** 环境未返回`ready`时 MUST NOT开始对应受管效果或声称Environment/正式Result成立

#### Scenario: 正式 Task 在明确仓库直接工作
- **WHEN** Agent已从用户授权、真实repository/ref、owned scope和副作用边界确认可以直接编辑、构建或执行有界测试，且当前动作不请求Buildr准备、占用、持久资源、正式环境证据或cleanup
- **THEN** 缺少Environment Plan、Receipt或projection MUST只形成可选准备建议，不得成为该直接动作的通用许可 blocker
- **AND** Agent MUST NOT把直接工作冒充ready Environment、Formal Verification、Candidate、Handoff或可由Buildr自动清理的资源

#### Scenario: Task Record 不存在
- **WHEN** 调用方请求为未知Task ID创建Environment Receipt
- **THEN** Task Environment MUST返回`blocked`和创建或恢复Task Record的next action
- **AND** MUST NOT创建checkout、依赖、runtime projection、资源或Environment Receipt

#### Scenario: Task 外有界操作
- **WHEN** Agent只执行单次测试、临时服务、API调用或其他不形成正式Task的有界操作
- **THEN** Task Environment MUST NOT自动创建Task或Environment Receipt
- **AND** Agent MUST按当前用户意图在本次操作中停止或披露临时资源

#### Scenario: 清理后维护 Task 元数据
- **WHEN** Task Environment已完成清理，而生命周期Skill仍需在canonical Workspace写入Receipt、Result或复盘材料
- **THEN** 该metadata-only写入 MUST NOT要求重新准备已清理的Task Environment
- **AND** MUST NOT把canonical metadata root误报为新的执行环境
