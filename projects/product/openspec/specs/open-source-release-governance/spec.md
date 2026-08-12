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

### Requirement: Release workflow 必须按版本和渠道受控发布
Buildr MUST 提供 tag 驱动、GitHub-hosted、Environment 审批且 OIDC-ready 的 release workflow，并 MUST 在发布前校验候选来源、版本、main/dev 收敛、dist-tag 和 tarball；发布成功后的远端 release task 分支清理 MUST 以稳定发布事实和用户明确授权为前提。

#### Scenario: 发布 prerelease tag
- **WHEN** `v<version>` tag 对应的 package version 包含 prerelease 标识
- **THEN** workflow MUST 使用 `next` dist-tag
- **AND** workflow MUST 在 `npm-production` Environment 中执行完整验证和公开候选检查后才允许 publish

#### Scenario: 发布稳定 tag
- **WHEN** `v<version>` tag 对应稳定 package version
- **THEN** workflow MUST 使用 `latest` dist-tag
- **AND** tag version MUST 与 package version 完全一致
- **AND** workflow MUST NOT 从长期 npm publish token 获得默认写权限

#### Scenario: 第一阶段只准备发布能力
- **WHEN** 本 change 完成并集成内部 `dev`
- **THEN** Buildr MUST NOT 因此自动推送公开 GitHub、创建 release tag 或执行 npm publish
- **AND** 外部发布 MUST 等待后续显式授权和账号侧配置完成

#### Scenario: 候选必须来自最新 dev
- **WHEN** 维护者准备目标版本 release candidate
- **THEN** release task MUST 记录准备时的 `origin/dev` commit 并从该基线形成候选
- **AND** 版本与发布材料提交 MUST 先通过 task finish 集成并推送到 `dev`
- **AND** 如需排除已有 dev 内容，维护者 MUST 先通过独立 change 在 dev 撤销，不得从旧 ancestor 直接发布

#### Scenario: main 合入前验证 dev 候选
- **WHEN** release task 准备创建 `dev` 到 `main` 的发布 PR
- **THEN** convergence gate MUST 证明 `origin/dev` 的 package version 和 tree 等于已验证候选
- **AND** release task branch 无法 fast-forward 集成 dev 时 MUST 停止发布准备

#### Scenario: main 合入后验证历史收敛
- **WHEN** 发布 PR 已 squash merge 到 `main`
- **THEN** convergence gate MUST 证明 `origin/main` 与 `origin/dev` tree 等于已验证候选
- **AND** history bridge 后 `origin/main` MUST 是 `origin/dev` 的 ancestor
- **AND** 任一 ref、tree、version 或 release task 状态不一致时 MUST 在创建 tag 前停止

#### Scenario: 发布完成后清理 release task 分支
- **WHEN** 目标 tag、npm 版本与 dist-tag、GitHub Release 和安装 smoke 均已验证成功，且远端存在 `tasks/release-<version>`
- **THEN** Agent MUST 展示待删除 ref、commit 和稳定发布证据
- **AND** Agent MUST 在用户明确授权后才删除该远端分支
- **AND** 删除后 MUST 重新查询远端并确认 ref 不存在

#### Scenario: 未授权或清理失败
- **WHEN** 用户未授权删除、远端查询不可用或分支删除失败
- **THEN** Agent MUST 保留该远端分支并报告清理 follow-up
- **AND** Agent MUST NOT 把清理失败解释为目标版本发布失败或重做 tag、npm publish、GitHub Release 的理由

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
