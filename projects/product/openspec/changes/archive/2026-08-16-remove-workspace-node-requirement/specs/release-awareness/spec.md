## MODIFIED Requirements

### Requirement: Buildr 必须让用户明确选择本机更新轨道
Buildr MUST 支持用户显式选择 `stable` 或 `candidate`，只安装该轨道本次观测到的精确版本，并 MUST NOT 自动切换轨道、自动安装或自动降级。

#### Scenario: 用户选择 candidate
- **WHEN** 用户执行 `buildr update --track candidate` 且 candidate 轨道存在高于当前安装的有效版本
- **THEN** Buildr MUST 安装精确的候选版本
- **AND** MUST NOT 改变 stable tag、Workspace metadata或 Agent runtime

#### Scenario: 用户选择 stable
- **WHEN** 用户执行 `buildr update --track stable` 且 stable 轨道存在高于当前安装的有效版本
- **THEN** Buildr MUST 安装精确的 GA 版本
- **AND** MUST NOT 同时安装 candidate 轨道

#### Scenario: 目标版本更低
- **WHEN** 所选轨道头低于当前安装版本
- **THEN** Buildr MUST 停止安装并说明不会自动降级
