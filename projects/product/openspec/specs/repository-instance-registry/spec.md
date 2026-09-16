# repository-instance-registry Specification

## Purpose
定义代码库实例（Repository Instance）的稳定身份、Git 来源、集成分支、默认物理位置及局部可用状态，使多个业务服务能够准确引用同一份代码基础，并确保智能体准备代码时不覆盖已有工作或猜测缺失来源。

## Requirements

### Requirement: 代码库实例独立登记
Buildr MUST 在 `repositories/manifest.yml` 登记代码库实例的稳定身份、工作空间身份、代码、名称、说明和来源。Git 来源 MUST 包含地址、远端与集成分支；本地当前分支和未提交状态 MUST 作为观察结果，不写回稳定声明。

#### Scenario: 同源不同分支
- **WHEN** 两个实例具有相同 Git 地址和不同集成分支
- **THEN** 系统 MUST 保留两个身份及各自位置，不自动合并

#### Scenario: 无远端的工作空间源码
- **WHEN** 代码由工作空间自身仓库承载
- **THEN** 系统 MUST 支持 workspace 来源，不虚构独立远端和集成分支

### Requirement: 代码登记与准备分离
新建受管 Git 实例 MUST 默认定位于 `repositories/<code>`；登记 MUST 不以代码已克隆为前提。已有外部附接位置和迁移保留位置 MUST 可准确定位。

#### Scenario: 本地目录缺失
- **WHEN** 清单有效而本地代码不存在
- **THEN** 系统 MUST 展示待准备状态与明确来源，保留引用关系

#### Scenario: 已有目标内容
- **WHEN** 智能体准备代码且目标目录已经存在
- **THEN** 指引 MUST 要求核对身份和工作状态，不覆盖内容、丢弃改动或隐式切换分支

#### Scenario: 来源缺失
- **WHEN** 目标实例没有可靠 Git 地址或分支
- **THEN** 智能体指引 MUST 要求补齐可靠来源，不猜测并执行克隆

### Requirement: 代码库修改受版本保护
代码库修改 MUST 核对当前清单版本并验证字段和路径边界。注销被引用实例 MUST 被拒绝，注销登记 MUST 不删除代码。

#### Scenario: 并发修改
- **WHEN** 用户提交的版本已经过期
- **THEN** 系统 MUST 返回冲突且不覆盖当前清单
