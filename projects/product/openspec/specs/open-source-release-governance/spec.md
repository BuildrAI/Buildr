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

### Requirement: Release tag 前必须证明发布权威一致
Buildr MUST 在 release contract 中声明唯一的机器可读发布权威元组，至少包含 provider、GitHub repository、workflow filename、GitHub Environment 与允许的 npm action。候选准备阶段 MUST 只验证该元组、workflow identity 与收敛 source 的静态结构和远端事实，MUST NOT dispatch hosted authority probe 或请求真实 npm token exchange。只有维护者明确授权正式发布后，Buildr 才 MUST 在创建或推送 release tag 前，由该 repository 的目标 workflow 在声明的 GitHub Environment 中，以 `id-token: write` 获得 GitHub OIDC 身份并对目标 npm package 完成一次 current token exchange；本机 maintainer session、`npm trust list`、静态配置或历史 provenance MUST NOT 替代该 hosted identity probe。Probe MUST 不创建 tag、不构建或发布 package，并 MUST 不输出、保存或上传 exchange 返回的 token。最终 `ready` evidence MUST 绑定收敛后的 source commit、workflow bytes、唯一 GitHub run、目标 package 与不含凭证的 exchange metadata；本机 preflight MUST 通过 GitHub current API 核对该 run 的 repository、workflow、event、head SHA、conclusion 与 artifact identity。Evidence MUST 在 15 分钟内被 pre-tag convergence 消费，且任何无法认证读取、远端竞争、证据过期或身份漂移 MUST fail closed。

#### Scenario: 候选准备只检查发布结构
- **WHEN** 维护者要求准备候选版但尚未授权正式发布
- **THEN** Buildr MUST 完成 dev/main source、version、tree、branch protection、release contract 与 workflow structure convergence
- **AND** MUST NOT dispatch hosted authority probe、请求 `npm-production` 审批或执行 npm token exchange

#### Scenario: current 发布权威完全一致
- **WHEN** maintainer 已明确授权正式发布，并针对收敛后的 `main` commit 和 workflow digest 触发 authority probe，且目标 GitHub-hosted workflow 在声明的 Environment 中成功以 OIDC 身份完成 npm package token exchange
- **THEN** probe MUST 形成不包含 token、绑定当前 source commit、workflow digest、package 与唯一 GitHub run 的 hosted evidence
- **AND** 本机 preflight MUST 只在 GitHub current run readback 与 hosted evidence 完全一致时形成 `ready` evidence
- **AND** pre-tag convergence MUST 只在该 evidence 未超过 15 分钟且仍匹配收敛 commit 和 workflow bytes 时允许进入 tag 授权
- **AND** 同一次准备到发布流程 MUST NOT 在准备阶段另行执行一份可复用或不可复用的 hosted probe

#### Scenario: 权威漂移或无法读取
- **WHEN** repository owner、workflow、Environment、allowed action、source commit、workflow digest、package、GitHub run identity 任一不一致，或 OIDC/token exchange/current run readback 任一步不可用
- **THEN** probe 或 preflight MUST 返回非零并形成明确的 blocked finding，包含 expected 与可安全公开的 actual/unavailable 原因
- **AND** pre-tag convergence MUST 阻止创建或推送 release tag
- **AND** Buildr MUST NOT 把本机 npm session、`npm trust list`、历史 publish provenance、静态测试或人工 checklist 勾选伪装成 current npm 控制面验证

#### Scenario: Probe 不产生发布副作用或凭证 artifact
- **WHEN** authority probe 成功或失败
- **THEN** workflow MUST NOT 创建或推送 tag、执行 pack/publish、创建 GitHub Release 或修改 npm/GitHub 控制面
- **AND** stdout、GitHub output、artifact 与最终 evidence MUST NOT 包含 GitHub OIDC ID token 或 npm exchange token

#### Scenario: Trusted Publishing 认证失败
- **WHEN** hosted authority probe 或正式 publish 因 `E401`、`ENEEDAUTH`、OIDC/Trusted Publisher 相关 `E404` 或 token exchange 拒绝而失败
- **THEN** workflow MUST 保留不含凭证的 npm 原始失败类别、HTTP 状态、退出码与已有 tag
- **AND** 诊断 MUST 输出 expected authority 元组与重跑 hosted probe、修复 current authority、rerun hosted workflow 的最小恢复路径
- **AND** workflow MUST NOT 回退到本机 token publish、删除 tag 或改写 npm/GitHub 控制面

### Requirement: Release workflow 必须同时回读 GA 与 RC tag
Buildr release workflow MUST 在公开 mutation 前后读取 npm `latest` 与 `next`，校验版本类型、目标 tag推进和非目标 tag不变；单一目标 tag readback MUST NOT作为完整发布收敛证据。

#### Scenario: 发布 RC 只推进 next
- **WHEN** prerelease 版本通过 `next` 发布
- **THEN** 发布后 `next` MUST等于新版本
- **AND** `latest` MUST等于发布前观测值

#### Scenario: 发布 GA 只推进 latest
- **WHEN** 稳定版本通过 `latest` 发布
- **THEN** 发布后 `latest` MUST等于新版本
- **AND** `next` MUST等于发布前观测值

#### Scenario: 目标 tag 类型错误
- **WHEN** RC 发布后的 `next` 不是 prerelease，或 GA 发布后的 `latest` 不是稳定版本
- **THEN** workflow MUST形成可解释的 tag语义诊断并失败
- **AND** 非目标 tag 已存在的类型异常 MUST保持原值并留给 Release Awareness 诊断，不得由本次发布静默修改

#### Scenario: 非目标 tag 漂移
- **WHEN** 发布期间非目标 tag 不同于冻结的发布前值
- **THEN** workflow MUST失败并报告 before/after
- **AND** MUST NOT把该漂移伪装成本次发布的成功副作用
