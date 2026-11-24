## ADDED Requirements

### Requirement: DSH 独立程序的依赖与账号协议必须对应发布版本

安装、现有配套校验和原生连接 MUST 按实际 DSH 包版本采用同一套兼容依赖：0.2.2 rc.1 使用 Cordis 4.1 系列及原账号控制器，0.2.2 rc.2 起在该系列使用同版本 DeepSeek 账号 Remote。受管模块 MUST 来自绑定程序的安装目录，兼容的原安装不得误报缺失，不强制绕过依赖冲突核验。

#### Scenario: 校验旧安装并更新到新版

- **WHEN** rc.1 已配备兼容组件且官方更新目标为同系列 rc.5
- **THEN** 不误报 rc.1 待修复；rc.5 使用新版账号 Remote，候选失败时保留旧接入。
