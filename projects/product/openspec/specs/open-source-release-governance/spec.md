# Buildr 开源发布治理

## Purpose

定义 Buildr 公开源码、npm package、双语 README、安全候选检查和受控 release workflow 的身份与发布前边界。

## Requirements

### Requirement: 公开产品身份必须一致且无占位符
Buildr MUST 将官方源码仓库声明为 `https://github.com/BuildrAI/Buildr`，将公开 npm package 声明为 `@buildr-ai/buildr`，并 MUST 在公开 metadata、安装命令、反馈入口和 License 中使用已确认身份而非占位符。

#### Scenario: 检查公开候选 metadata
- **WHEN** 维护者运行开源候选检查
- **THEN** repository、homepage 和 bugs MUST 指向 `BuildrAI/Buildr`
- **AND** npm package MUST 使用 `@buildr-ai/buildr` 且 bin MUST 继续暴露 `buildr`
- **AND** License MUST 声明 `Copyright (c) 2025-2026 陈俊`
- **AND** tracked 公开材料 MUST NOT 包含 repository URL 占位符

### Requirement: 公开 README 必须提供中文入口和英文翻译
Buildr MUST 使用根 `README.md` 作为中文产品入口，并 MUST 提供 `README.en.md` 作为 README 的完整英文翻译；其他文档 MUST 继续遵循 Project 管理语言而不要求双语复制。

#### Scenario: 用户从任一 README 开始
- **WHEN** 用户打开中文或英文 README
- **THEN** README MUST 在顶部链接另一语言版本
- **AND** 两份 README MUST 包含一致的 Agent-first 产品定位、问题与价值、工作方式、典型场景、分角色价值、核心模型、快速开始、当前能力与边界和文档导航
- **AND** 两份 README MUST 使用相同的 canonical repository、npm package、CLI 命令和 supported Agent runtime 事实
- **AND** 快速开始 MUST 同时提供 registry package 和开发 checkout 两种 Buildr 来源，并汇合到相同的 runtime discovery 与 init onboarding
- **AND** README MUST 将快速开始的开发 checkout 安装路径与 Buildr 自举 workspace 的仓库结构说明清楚分工，不得在两个章节重复完整 onboarding

### Requirement: 开源候选必须通过可重复安全扫描
Buildr MUST 提供可在本地和 CI 重复运行的开源候选 verifier，扫描 tracked candidate tree 和 npm tarball inventory，并 MUST 对敏感信息、内部来源、占位符、异常大文件或禁止发布路径 fail closed。

#### Scenario: 扫描安全候选
- **WHEN** verifier 检查准备公开的最终候选
- **THEN** verifier MUST 检查常见 secret/private-key 模式、内部 remote/domain、个人绝对路径、公开 URL 占位符和异常大文件
- **AND** verifier MUST 检查 npm tarball 不包含 `.git`、OpenSpec active/archive、task worktree、Agent runtime 或其他非发布资产
- **AND** verifier MUST 仅读取 tracked candidate 和生成的 tarball inventory，不得扫描用户 home、登录态或本机 secrets

#### Scenario: 候选包含被禁止内容
- **WHEN** 任一 tracked 文件或 tarball entry 命中未允许的阻塞规则
- **THEN** verifier MUST 返回非零状态
- **AND** 诊断 MUST 包含规则、相对路径和可执行的修复方向，且 MUST NOT 回显 secret 全文

### Requirement: GitHub Release 必须使用匹配版本的 changelog
Buildr MUST 将根 `CHANGELOG.md` 中与目标 package version 精确匹配的版本章节作为 GitHub Release 的具体发布说明来源，并 MUST 在 npm publish 前完成提取和校验。

#### Scenario: 为目标 tag 生成具体发布说明
- **WHEN** tag 驱动的 release workflow 已解析出目标 package version
- **THEN** workflow MUST 从 `CHANGELOG.md` 提取唯一的 `## <version> - <YYYY-MM-DD>` 章节
- **AND** GitHub Release body MUST 包含该章节的具体内容且不得包含相邻版本章节
- **AND** workflow MUST NOT 只使用 GitHub 自动生成的 PR 摘要替代该内容

#### Scenario: 目标版本发布说明无效
- **WHEN** 目标版本章节缺失、重复或没有非空正文
- **THEN** release notes 生成 MUST 返回非零状态并提供可执行诊断
- **AND** workflow MUST 在 registry write 或 npm publish 之前停止
- **AND** workflow MUST NOT 静默回退到自动生成的 Release body

#### Scenario: 创建候选版 GitHub Release
- **WHEN** 已验证的 prerelease tag 触发 GitHub Release 创建
- **THEN** workflow MUST 使用预先生成的 notes file
- **AND** workflow MUST 校验远端 tag 已存在
- **AND** GitHub Release MUST 标记为 prerelease 且 MUST NOT 标记为 Latest

#### Scenario: 创建稳定版 GitHub Release
- **WHEN** 已验证的 stable tag 触发 GitHub Release 创建
- **THEN** workflow MUST 使用预先生成的 notes file
- **AND** workflow MUST 校验远端 tag 已存在
- **AND** GitHub Release MUST NOT 标记为 prerelease

### Requirement: Release workflow 必须只发布 npm package
Buildr release workflow MUST 只将唯一 `@buildr-ai/buildr` tarball 发布到 npm Registry。Workflow MUST 从 tag、package version、source commit、dist-tag 与 release notes 解析唯一 release contract，只执行一次 application payload build 和一次 `npm pack`，并让 smoke、protected publish 与 Registry integrity readback 消费同一 tarball bytes。GitHub Release MAY 承载 tag notes metadata，但 MUST NOT 上传 npm tarball、Launcher、SEA、PKG/MSI、platform manifest 或 checksums。

#### Scenario: 可逆验证先于 npm publish
- **WHEN** tag workflow 准备发布
- **THEN** npm inventory、Host Node CLI/Web、Launcher lifecycle、package identity、integrity 与 release notes checks MUST 在 `npm publish` 前全部通过
- **AND** 任一失败 MUST 阻止不可逆发布

#### Scenario: 发布并回读同一 tarball
- **WHEN** protected npm publish 获得授权
- **THEN** workflow MUST 发布已冻结 tarball，并从官方 Registry 读取精确 version/integrity 后重新安装 smoke
- **AND** MUST NOT重新 pack、切换本地 publish 或把 Actions artifact 作为公共下载地址

### Requirement: 正式 Buildr bytes 必须只由 npm Registry 承载
Buildr 当前正式产品 bytes MUST 只通过 npm Registry 的 `@buildr-ai/buildr` package 分发。官网、README 与安装说明 MUST 只指向 npm installation；本机 `.app` 或 Start Menu shortcut MUST 由用户显式运行已安装 Buildr 生成，不得作为下载资产、GitHub Release Asset 或第二份 binary 保存。

#### Scenario: 获取正式 Buildr
- **WHEN** 用户查找正式安装方式
- **THEN** 文档 MUST 提供 `npm install -g @buildr-ai/buildr` 与兼容 Node 要求
- **AND** MUST NOT 提供 `.pkg`、`.msi`、SEA 或 Actions artifact 下载链接

#### Scenario: 获取图形入口
- **WHEN** npm 用户需要图形入口
- **THEN** 文档 MUST 指引显式执行 `buildr web launcher install`
- **AND** 生成的本机投射 MUST NOT 上传到 Registry、GitHub Release、官网或另一个 binary store

### Requirement: GitHub Release metadata 必须可恢复且禁止 binary Assets
GitHub Release metadata MUST 继续与 tag、target commit、version、notes 和 prerelease/Latest 语义一致，但当前 release workflow MUST NOT 创建或 ensure 正式 binary Assets。npm Registry 的已发布 version/integrity 是唯一 product-byte recovery authority；同 version 已存在且 integrity 相同时 MUST 复用，漂移时 MUST 停止且不得覆盖。

#### Scenario: 重跑缺少 npm publish 的 tag workflow
- **WHEN** tag metadata 已存在但 npm version 尚不存在
- **THEN** workflow MUST 复用冻结 tarball并只补齐 npm publish/readback
- **AND** MUST NOT 创建平台 Assets 或重建 tarball

#### Scenario: npm version 已存在
- **WHEN** Registry 已存在相同 version
- **THEN** workflow MUST 比较 package、version 与 integrity；完全相同时复用并继续 readback，任何不一致时停止
- **AND** MUST NOT unpublish、覆盖或发布第二份 bytes
