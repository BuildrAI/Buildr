## ADDED Requirements

### Requirement: Release tag 前必须证明发布权威一致
Buildr MUST 在 release contract 中声明唯一的机器可读发布权威元组，至少包含 provider、GitHub repository、workflow filename、GitHub Environment 与允许的 npm action。创建或推送 release tag 前，Buildr MUST 只读核对 package metadata、Git remote、目标 workflow、GitHub current repository/Environment 与 npm Trusted Publisher current 配置，并 MUST 只在全部事实与元组精确一致时形成 `ready` evidence。Evidence MUST 绑定收敛后的 source commit 与 workflow bytes，并 MUST 在 15 分钟内被 post-main convergence 消费；历史 provenance、checklist 文本、过期 evidence 或无法认证读取的 npm 配置 MUST NOT 被当成 current authority 证明。

#### Scenario: current 发布权威完全一致
- **WHEN** maintainer 在 tag 前运行 authority preflight，且本地声明、GitHub current 状态和 npm Trusted Publisher current 配置均与 release contract 元组精确一致
- **THEN** preflight MUST 形成绑定当前 source commit 与 workflow digest 的 `ready` evidence
- **AND** post-main convergence MUST 只在该 evidence 未超过 15 分钟且仍匹配收敛 commit 和 workflow bytes 时允许进入 tag 授权

#### Scenario: 权威漂移或无法读取
- **WHEN** repository owner、workflow、Environment、allowed action 任一不一致，或 npm CLI 不支持 current trust readback，或 maintainer session 无法认证读取 Trusted Publisher
- **THEN** preflight MUST 返回非零并形成明确的 blocked finding，包含 expected 与可安全公开的 actual/unavailable 原因
- **AND** post-main convergence MUST 阻止创建或推送 release tag
- **AND** Buildr MUST NOT 把历史 publish provenance、静态测试或人工 checklist 勾选伪装成 current npm 控制面验证

#### Scenario: Trusted Publishing 认证失败
- **WHEN** GitHub-hosted publish 因 `E401`、`ENEEDAUTH`、OIDC/Trusted Publisher 相关 `E404` 失败
- **THEN** workflow MUST 保留 npm 原始失败、退出码与已有 tag
- **AND** 诊断 MUST 输出 expected authority 元组与重跑 preflight、修复 current authority、rerun hosted workflow 的最小恢复路径
- **AND** workflow MUST NOT 回退到本机 token publish、删除 tag或改写 npm/GitHub 控制面
