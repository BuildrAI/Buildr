## ADDED Requirements

### Requirement: Buildr 必须统一感知 GA 与 RC 发布轨道
Buildr Release Awareness MUST 一次读取 `@buildr-ai/buildr` 的 npm `latest` 与 `next`，将 `latest` 映射为 `stable` GA 正式版、将 `next` 映射为 `candidate` RC 候选版，并为 CLI、Doctor、Buildr Web 与 Agent 提供同一结构化 snapshot。

#### Scenario: 两个轨道都存在
- **WHEN** `latest` 指向稳定 semver 且 `next` 指向 prerelease semver
- **THEN** snapshot MUST 分别返回 stable 与 candidate 的 tag、version、可安装状态及其与当前安装版本的关系
- **AND** MUST NOT 用一次跨轨道最大版本比较替代两个轨道的独立判断

#### Scenario: latest 仍指向历史 RC
- **WHEN** `latest` 指向 prerelease semver
- **THEN** Buildr MUST 将 GA 正式版报告为尚未发布且不可安装
- **AND** notices MUST 说明 `latest` 配置仍指向该历史候选版

#### Scenario: next 类型错误
- **WHEN** `next` 缺失或指向稳定 semver
- **THEN** Buildr MUST 将 RC 候选版报告为尚未发布或配置异常且不可安装
- **AND** stable 轨道的有效结果 MUST 保持可用

### Requirement: Buildr 必须让用户明确选择本机更新轨道
Buildr MUST 支持用户显式选择 `stable` 或 `candidate`，只安装该轨道本次观测到的精确版本，并 MUST NOT 自动切换轨道、自动安装或自动降级。

#### Scenario: 用户选择 candidate
- **WHEN** 用户执行 `buildr update --track candidate` 且 candidate 轨道存在高于当前安装的有效版本
- **THEN** Buildr MUST 安装精确的候选版本
- **AND** MUST NOT 改变 stable tag、Workspace、Workspace Node 或 Agent runtime

#### Scenario: 用户选择 stable
- **WHEN** 用户执行 `buildr update --track stable` 且 stable 轨道存在高于当前安装的有效版本
- **THEN** Buildr MUST 安装精确的 GA 版本
- **AND** MUST NOT 同时安装 candidate 轨道

#### Scenario: 目标版本更低
- **WHEN** 所选轨道头低于当前安装版本
- **THEN** Buildr MUST 停止安装并说明不会自动降级

### Requirement: Release Awareness 必须通过完整用户通知渠道投影
Buildr MUST 让 CLI、Doctor、Buildr Web 与产品入口 Buildr Skill 消费同一 Release Awareness 语义；任何入口不得自行重新解释 `latest`、`next` 或版本比较。

#### Scenario: 新轨道头被多入口发现
- **WHEN** stable 或 candidate 出现高于当前安装的新版本
- **THEN** CLI MUST 展示更新，Doctor MUST 投影非阻断 notice，Buildr Web MUST 展示全局提示，Buildr Skill MUST 能让 Agent 主动告知用户并请求选择

#### Scenario: Registry 不可达
- **WHEN** Release Awareness 查询失败
- **THEN** `update check` MUST 返回明确的不可用诊断
- **AND** Doctor 与 Buildr Web MUST 保留其核心功能且不得把该失败解释为 Workspace 不健康

### Requirement: 发布提醒状态必须只保存在用户级 Buildr Data Root
Buildr MUST 为 stable 与 candidate 分别保存最小 `lastSeenVersion`、`lastNotifiedVersion` 与检查时间，以避免相同轨道头反复通知；该状态 MUST NOT 写入 Workspace。

#### Scenario: 首次发现新版本
- **WHEN** 某轨道头不同于已保存的 lastSeenVersion
- **THEN** Buildr MUST 更新该轨道观测状态并允许形成一次新通知

#### Scenario: 重复观察相同版本
- **WHEN** 某轨道头与已保存的 lastNotifiedVersion 相同
- **THEN** Buildr MUST 保留可查询的版本事实
- **AND** MUST NOT要求 Agent、Doctor 与 Web 每次都重复主动打扰用户

#### Scenario: 保存通知状态
- **WHEN** Buildr 写入 Release Awareness 状态
- **THEN** 文件 MUST 位于用户级 Buildr Data Root
- **AND** MUST NOT包含 Workspace 内容、凭证或 npm token
