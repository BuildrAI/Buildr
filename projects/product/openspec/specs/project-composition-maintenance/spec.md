# project-composition-maintenance Specification

## Purpose
提供可发现的项目（Project）组成维护方法，帮助智能体（Agent）依据业务目标及当前事实梳理参与的服务（Service），并在日常开发中维护同一份本地登记，使已有组成图能够反映当前工作范围。

## Requirements

### Requirement: 按业务目标维护现有组成

Buildr SHALL 提供 `project-composition-maintenance` 技能（Skill），支持首次梳理和开发中的增量维护；组成 SHALL 复用现有项目（Project）的 `serviceIds` 及服务（Service）、代码库实例（Repository Instance）身份，不创建第二份图数据或服务（Service）间依赖。

#### Scenario: 按需使用公共能力
- **WHEN** 业务已确认需要某项已登记公共能力
- **THEN** 智能体（Agent）SHALL 将原有服务（Service）身份关联到该项目（Project），保留其他业务的关联，不复制实现或要求依赖整个基础项目（Project）

#### Scenario: 扫描未发现已确认组成
- **WHEN** 代码暂未使用某项已确认承担实现职责的服务（Service），或扫描范围不足
- **THEN** 智能体（Agent）SHALL 核对已确认决定和业务用途，不仅凭扫描结果移除组成；未确定选项不登记为已确认组成

### Requirement: 在开发中维护实际变化

日常开发指引 SHALL 在可能新增、替换或停用组成时引导采用该技能（Skill），在同次工作中复核最终变化；无关开发 SHALL 不触发全量梳理或无变化写入。技能（Skill）SHALL 复用当前范围的维护授权，不把一次授权扩展为永久全工作空间（Workspace）维护。

#### Scenario: 引入新的公共能力
- **WHEN** 已授权业务开发引入一个原先未关联的服务（Service）
- **THEN** 智能体（Agent）SHALL 在同次工作中维护受影响组成并说明理由，无需用户逐项手动登记

#### Scenario: 停用一项共享实现
- **WHEN** 已确认当前业务不再需要某个共享服务（Service）
- **THEN** 智能体（Agent）SHALL 仅解除当前关联，保留其他使用方、全局登记及代码

### Requirement: 复用本地保存与核对

独立运行版（Standalone）SHALL 通过已有本地资产动作保存清单（Manifest），核对已观察版本并保留无关内容。技能（Skill）SHALL 核对保存结果，报告实际变化、依据及未确定项；已有组成图继续读取同一关系，不能声称具备后台监听或未实现的云端接口（API）。

#### Scenario: 保存期间关系发生变化
- **WHEN** 当前清单（Manifest）版本与写入观察不一致
- **THEN** 保存 SHALL 拒绝陈旧写入；智能体（Agent）重读并重新判断增量，不静默覆盖其他关联

#### Scenario: 仅检查组成
- **WHEN** 用户只要求查看或检查组成
- **THEN** 智能体（Agent）SHALL 返回组成及差异，不写入清单（Manifest）
