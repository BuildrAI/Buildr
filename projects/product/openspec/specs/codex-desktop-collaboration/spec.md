# codex-desktop-collaboration Specification

## Purpose
定义旧 Codex 外部协作的退役边界：不再提供独立生成接入、任务（Task）与原生会话（Session）关联及双向导航，旧调用不能恢复登记或关系，厂商自身账号与聊天保持。

## Requirements

### Requirement: Codex 外部协作入口必须退役

系统 MUST 不再提供旧 Codex 生成接入、外部会话（Session）关联和双向导航入口；任务管理 MUST 不再读取外部会话身份或自动建立关系。旧命令和接口（API）MUST 不得恢复登记、创建关系或触发模型执行。此退役 MUST 不删除 Codex 自身的账号和原生聊天。

#### Scenario: 旧调用到达
- **WHEN** 旧客户端尝试使用 Codex 外部关联或旧接入命令
- **THEN** 系统 MUST 将其作为不可用入口处理，不创建登记、关系或替代聊天
