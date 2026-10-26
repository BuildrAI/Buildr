# 项目声明维护

## Purpose

将准备声明与测试地图分别交给实际专业维护者，删除独立声明接入中转技能（Skill），保留真实入口发现、准确范围、授权和版本冲突保护，不保存重复状态或代替实际执行。

## Requirements

### Requirement: 声明维护必须由实际专业维护者直接承接
Buildr SHALL 不再交付独立 `declaration-intake` 技能（Skill）。项目准备声明 SHALL 由产品入口指引核对实际准备命令、根和范围后维护；测试地图 SHALL 由 `project-testing` 依据实际稳定入口维护。只读发现 SHALL 不自动写入声明，写入 SHALL 核对当前授权、准确对象及版本，未知外部能力 SHALL 交还原专业能力。

#### Scenario: 用户授权开发导致测试入口变化
- **WHEN** 当前授权范围内的测试入口增加、删除或变化
- **THEN** project-testing SHALL 核对真实覆盖并维护相应稳定声明，不要求经过独立接入技能（Skill）

#### Scenario: 新的外部副作用尚未授权
- **WHEN** 声明变化扩大外部副作用或长期语义且既有授权未覆盖
- **THEN** 智能体（Agent）SHALL 展示准确影响请求必要决定，并继续不依赖该决定的安全工作
