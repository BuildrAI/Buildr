## REMOVED Requirements

### Requirement: Preparation缺口必须提供Declaration Intake恢复入口
**Reason**: 清理旧分类、入口及技能职责，保留对应行为证明。
**Migration**: 由本变更四类检查、两个项目技能及同文件的新要求承接。

## ADDED Requirements

### Requirement: Preparation缺口必须提供声明核对恢复入口

`buildr` 的准备指引 MAY只读指出Project preparation声明缺失、失效或与真实入口不一致；它 MUST不阻塞无关开发动作，也不得把缺口写成Task Environment blocker。

#### Scenario: 声明缺失但当前动作不需要准备
- **WHEN** Agent能够直接编辑、审查、验证或交付且无需该准备入口
- **THEN** 声明缺口 MUST不阻塞当前动作

#### Scenario: Recipe缺失
- **WHEN** 当前动作明确需要的Recipe不存在
- **THEN** 只依赖该Recipe的动作 MUST停止并指向 `buildr` 的准备指引

#### Scenario: 声明缺失
- **WHEN** Project没有`preparation.yml`且Agent无法确定必要准备入口
- **THEN** `buildr` 的准备指引 MUST报告事实缺口，不创建Environment blocker
