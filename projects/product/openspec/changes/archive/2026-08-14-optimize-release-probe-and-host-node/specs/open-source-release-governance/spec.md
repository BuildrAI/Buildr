## MODIFIED Requirements

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
