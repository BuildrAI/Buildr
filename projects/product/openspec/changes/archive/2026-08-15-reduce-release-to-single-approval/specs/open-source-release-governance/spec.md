## MODIFIED Requirements

### Requirement: GitHub Release 必须使用匹配版本的 changelog
Buildr MUST 将根 `CHANGELOG.md` 中与目标 package version 精确匹配的版本章节作为 GitHub Release 的具体发布说明来源，并 MUST 在 npm publish 前完成提取和校验。

#### Scenario: 为目标 tag 生成具体发布说明
- **WHEN** 显式 dispatch 的 release workflow 已解析出目标 package version 与 tag
- **THEN** workflow MUST 从 `CHANGELOG.md` 提取唯一的 `## <version> - <YYYY-MM-DD>` 章节
- **AND** GitHub Release body MUST 包含该章节的具体内容且不得包含相邻版本章节
- **AND** workflow MUST NOT 只使用 GitHub 自动生成的 PR 摘要替代该内容

#### Scenario: 目标版本发布说明无效
- **WHEN** 目标版本章节缺失、重复或没有非空正文
- **THEN** release notes 生成 MUST 返回非零状态并提供可执行诊断
- **AND** workflow MUST 在 tag、registry write 或 npm publish 之前停止
- **AND** workflow MUST NOT 静默回退到自动生成的 Release body

#### Scenario: 创建候选版 GitHub Release
- **WHEN** protected release transaction 已创建或复用匹配 source 的 prerelease tag
- **THEN** workflow MUST 使用预先生成的 notes file
- **AND** workflow MUST 校验远端 tag 已存在且指向目标 source commit
- **AND** GitHub Release MUST 标记为 prerelease 且 MUST NOT 标记为 Latest

#### Scenario: 创建稳定版 GitHub Release
- **WHEN** protected release transaction 已创建或复用匹配 source 的 stable tag
- **THEN** workflow MUST 使用预先生成的 notes file
- **AND** workflow MUST 校验远端 tag 已存在且指向目标 source commit
- **AND** GitHub Release MUST NOT 标记为 prerelease

### Requirement: Release workflow 必须只发布 npm package
Buildr release workflow MUST 只将唯一 `@buildr-ai/buildr` tarball 发布到 npm Registry。Workflow MUST 从显式 dispatch 的 version/tag、source commit、candidate identities、dist-tag 与 release notes 解析唯一 release contract，只执行一次 application payload build 和一次 `npm pack`，并让 smoke、protected release transaction 与 Registry integrity readback 消费同一 tarball bytes。GitHub Release MAY 承载 tag notes metadata，但 MUST NOT 上传 npm tarball、Launcher、SEA、PKG/MSI、platform manifest 或 checksums。

#### Scenario: 可逆验证先于 npm publish
- **WHEN** dispatch workflow 准备正式发布
- **THEN** npm inventory、Host Node CLI/Web、Launcher lifecycle、package identity、integrity 与 release notes checks MUST 在唯一 `npm-production` job请求审批前全部通过
- **AND** 任一失败 MUST 阻止 Environment deployment与不可逆发布

#### Scenario: 发布并回读同一 tarball
- **WHEN** protected release transaction 获得授权
- **THEN** workflow MUST 先完成 current authority probe、最终 pre-tag 校验和匹配 tag ensure，再发布已冻结 tarball并从官方 Registry读取精确 version/integrity后重新安装 smoke
- **AND** MUST NOT重新 pack、切换本地 publish或把 Actions artifact作为公共下载地址

### Requirement: GitHub Release metadata 必须可恢复且禁止 binary Assets
GitHub Release metadata MUST 继续与 tag、target commit、version、notes 和 prerelease/Latest 语义一致，但当前 release workflow MUST NOT 创建或 ensure 正式 binary Assets。npm Registry 的已发布 version/integrity 是唯一 product-byte recovery authority；同 version 已存在且 integrity 相同时 MUST 复用，漂移时 MUST 停止且不得覆盖。

#### Scenario: 重跑缺少 npm publish 的 tag workflow
- **WHEN** target tag 已存在且解析到相同 source commit，但 npm version 尚不存在
- **THEN** workflow MUST 复用匹配 tag与冻结 tarball并只补齐 npm publish/readback
- **AND** MUST NOT 创建平台 Assets、移动 tag或重建 tarball

#### Scenario: npm version 已存在
- **WHEN** Registry 已存在相同 version
- **THEN** workflow MUST 比较 package、version 与 integrity；完全相同时复用并继续 readback，任何不一致时停止
- **AND** MUST NOT unpublish、覆盖或发布第二份 bytes

### Requirement: Release tag 前必须证明发布权威一致
Buildr MUST 在 release contract 中声明唯一的机器可读发布权威元组，至少包含 provider、GitHub repository、workflow filename、GitHub Environment 与允许的 npm action。候选准备阶段 MUST 只验证该元组、workflow identity 与收敛 source 的静态结构和远端事实，MUST NOT dispatch正式 release workflow、请求真实 npm token exchange或创建 tag。只有维护者明确授权正式发布后，本机 MUST 针对current `origin/main` dispatch一次完整release workflow；该workflow MUST只有一个使用声明Environment的protected release transaction job，并 MUST 在一次审批后以`id-token: write`完成current OIDC token exchange、最终pre-tag convergence、不可移动tag ensure与npm publish。本机maintainer session、`npm trust list`、静态配置或历史provenance MUST NOT替代同一protected transaction内的hosted identity proof。Credential-free evidence MUST绑定source commit、workflow bytes、唯一GitHub run/attempt、目标package与exchange metadata，并 MUST在tag mutation前由同一job消费；任何远端竞争、证据过期或身份漂移 MUST fail closed。

#### Scenario: 候选准备只检查发布结构
- **WHEN** 维护者要求准备候选版但尚未授权正式发布
- **THEN** Buildr MUST 完成 dev/main source、version、tree、branch protection、release contract 与 workflow structure convergence
- **AND** MUST NOT dispatch release workflow、请求 `npm-production`审批、执行npm token exchange或创建tag

#### Scenario: 一次审批启动唯一受保护事务
- **WHEN** maintainer明确授权正式发布，且workflow的可逆contract/candidate/Host Node/Launcher jobs全部通过
- **THEN** GitHub MUST只为唯一protected release transaction job创建`npm-production`deployment
- **AND** 该job MUST在同一次approved execution中依次完成hosted OIDC probe、最终pre-tag gate、tag ensure、publish与公开readback
- **AND** 其他job MUST NOT声明`npm-production`、`id-token: write`或tag/npm mutation权限

#### Scenario: current 发布权威完全一致
- **WHEN** protected transaction针对冻结的`main`commit和workflow digest成功以OIDC身份完成npm package token exchange
- **THEN** probe MUST形成不包含token、绑定current source、workflow、package与同一GitHub run/attempt的hosted evidence
- **AND** pre-tag convergence MUST只在该evidence仍current、exchange未过期且remote dev/main/candidate identities一致时允许tag ensure
- **AND** workflow MUST在tag创建后继续使用同一冻结tarball完成publish，不dispatch第二个受保护run

#### Scenario: 权威漂移或无法读取
- **WHEN** repository owner、workflow、Environment、allowed action、source commit、workflow digest、package、run identity、remote main/dev或candidate tree任一不一致，或OIDC/token exchange任一步不可用
- **THEN** probe或pre-tag gate MUST返回非零并形成明确blocked finding，包含expected与可安全公开的actual/unavailable原因
- **AND** protected transaction MUST在tag和npm mutation前停止
- **AND** Buildr MUST NOT把本机npm session、`npm trust list`、历史publish provenance、静态测试或人工checklist勾选伪装成current npm控制面验证

#### Scenario: Probe 不产生发布副作用或凭证 artifact
- **WHEN** protected transaction内的authority probe成功或失败
- **THEN** stdout、GitHub output、artifact与最终evidence MUST NOT包含GitHub OIDC ID token或npm exchange token
- **AND** probe成功本身 MUST NOT跳过pre-tag convergence或直接构成tag/publish成功

#### Scenario: Trusted Publishing 认证失败
- **WHEN** hosted authority probe或正式publish因`E401`、`ENEEDAUTH`、OIDC/Trusted Publisher相关`E404`或token exchange拒绝而失败
- **THEN** workflow MUST保留不含凭证的npm原始失败类别、HTTP状态、退出码与已有匹配tag
- **AND** 诊断 MUST输出expected authority元组与修复current authority、rerun同一release transaction的最小恢复路径
- **AND** workflow MUST NOT回退到本机token publish、删除或移动tag、改写npm/GitHub控制面
