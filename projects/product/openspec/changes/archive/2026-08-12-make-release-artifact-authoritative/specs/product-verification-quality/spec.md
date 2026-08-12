## ADDED Requirements

### Requirement: 正式发布必须围绕一个不可变 tarball 收敛
Buildr 正式 tag 发布 workflow MUST 将一次 `npm pack` 产生的 tarball 作为本次发布的唯一 release artifact，并 MUST 让发布前 smoke、`npm publish`、制品 evidence 与 registry integrity 核对绑定同一 artifact identity；workflow MUST NOT 在 tag 发布阶段重复运行完整 Candidate。

#### Scenario: 准备正式发布物
- **WHEN** 受保护 tag workflow 完成 release contract 与 release notes 检查
- **THEN** workflow MUST 只执行一次 `npm pack` 并生成包含 package name/version、filename、文件清单、size、SHA-256 与 SHA-512 integrity 的 manifest
- **AND** tarball 与 manifest MUST 作为同一 run 的 CI artifact 保存

#### Scenario: 发布前验证正式发布物
- **WHEN** release artifact 已生成
- **THEN** 发布前 smoke MUST 从该 tarball 安装 CLI 并完成 `init`、`sync`、`doctor`、optional Component uninstall 和最终 doctor
- **AND** smoke MUST NOT 从 checkout 重新 pack 或使用 development checkout runtime 冒充安装后 CLI

#### Scenario: 发布同一个 tarball
- **WHEN** 官方 npm registry 不存在目标 package version 且发布前 smoke 通过
- **THEN** workflow MUST 使用 trusted publishing 执行 `npm publish <tarball>` 并应用 release contract 指定的 dist-tag
- **AND** workflow MUST NOT 从 checkout、目录或第二个 pack 结果隐式重建待发布 bytes

#### Scenario: Registry 已存在目标版本
- **WHEN** 同一 tag workflow 重跑且官方 npm registry 已存在目标 package version
- **THEN** workflow MUST 比较 registry `dist.integrity` 与本次 artifact manifest 的 SHA-512 integrity
- **AND** identity 相同 MUST 跳过 publish，identity 不同 MUST fail closed 且不得覆盖、unpublish 或移动现有版本

#### Scenario: 发布后核对官方 registry
- **WHEN** publish 已成功或 registry 已有同 identity 版本
- **THEN** workflow MUST 以有界重试确认官方 registry 的 version、integrity 和目标 dist-tag
- **AND** workflow MUST 从官方 registry 安装精确 `name@version` 并完成与发布前相同的 CLI 生命周期 smoke

### Requirement: 正式发布恢复必须保留已完成的不可逆事实
Buildr 正式发布 workflow MUST 在 npm version 或 GitHub Release 已经存在时核对并复用一致事实，只补齐缺失步骤；任一事实不一致 MUST fail closed，且 workflow MUST NOT 通过删除 tag、重复 publish、unpublish 或覆盖公开 Release 隐藏部分成功。

#### Scenario: GitHub Release 尚不存在
- **WHEN** npm registry 已确认目标 artifact identity 且目标 GitHub Release 不存在
- **THEN** workflow MUST 从目标 CHANGELOG 章节创建指向同一 tag 的 GitHub Release
- **AND** prerelease 与 Latest 状态 MUST 符合 release contract

#### Scenario: GitHub Release 已存在
- **WHEN** 同一 tag workflow 重跑且目标 GitHub Release 已存在
- **THEN** workflow MUST 核对 tag、target commit、body 与 prerelease/Latest 状态
- **AND** 全部一致 MUST 复用该 Release，任一不一致 MUST fail closed 且不得自动覆盖

#### Scenario: 不可逆步骤后验证失败
- **WHEN** npm publish 或 GitHub Release 已成功，但后续 registry smoke、readback 或网络步骤失败
- **THEN** workflow MUST 保留已完成的 tag、npm version、dist-tag 与 Release 事实并报告失败阶段
- **AND** 后续同一 tag 重跑 MUST 从 identity/readback gate 恢复，不得重做已经成功的不可逆动作
