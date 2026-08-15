## MODIFIED Requirements

### Requirement: registry package 支持 CLI 自更新
从支持的 npm registry 安装的 Buildr package MUST 支持 `buildr update check` 同时检查 `latest` 与 `next`，并支持 `buildr update --track stable|candidate` 更新同一 package identity；所有动作不得隐式维护 Workspace。

#### Scenario: 检查 registry 更新
- **WHEN** registry 安装的 CLI 运行 `buildr update check --json`
- **THEN** Buildr MUST 通过现有 npm update authority 一次查询同一 package identity 的 `dist-tags.latest` 与 `dist-tags.next`
- **AND** Buildr MUST NOT 修改 package、Workspace 或 Agent runtime

#### Scenario: 更新 registry package
- **WHEN** registry 安装的 CLI 运行 `buildr update --track stable|candidate` 且所选轨道存在可安全安装的新版本
- **THEN** Buildr MUST 更新承载当前 executable 的 package到本次观测的精确版本
- **AND** Buildr MUST 保持安装 prefix、registry 与 scope
- **AND** Buildr MUST NOT 执行 workspace sync 或 doctor

#### Scenario: registry update 回归验证
- **WHEN** 产品验证构造包含 GA 与 RC 版本的临时 registry 或等价隔离 fixture
- **THEN** verifier MUST 证明 installed executable 能同时检查两个轨道并分别更新到用户选择的精确版本
- **AND** verifier MUST 证明更新动作没有修改测试 Workspace，后续显式 sync 才完成 Workspace reconcile

### Requirement: npm 版本必须映射明确 dist-tag
Buildr release automation MUST 将 prerelease 版本发布到 `next`，将稳定版本发布到 `latest`，并 MUST 拒绝 tag 与 package version 不一致或版本类型与目标 dist-tag 不一致的候选。

#### Scenario: 发布 0.1.0 RC
- **WHEN** package version 是 `0.1.0-rc.1` 且 Git tag 是 `v0.1.0-rc.1`
- **THEN** release automation MUST 选择 npm dist-tag `next`

#### Scenario: 发布 0.1.0 正式版
- **WHEN** package version 是 `0.1.0` 且 Git tag 是 `v0.1.0`
- **THEN** release automation MUST 选择 npm dist-tag `latest`

#### Scenario: tag 与 package version 不一致
- **WHEN** release tag 去除 `v` 后不等于 `package.json#version`
- **THEN** release automation MUST 在 npm publish 前失败

#### Scenario: dist-tag 版本类型不匹配
- **WHEN** 稳定版本准备发布到 `next` 或 prerelease 准备发布到 `latest`
- **THEN** release automation MUST在公开 mutation 前失败
