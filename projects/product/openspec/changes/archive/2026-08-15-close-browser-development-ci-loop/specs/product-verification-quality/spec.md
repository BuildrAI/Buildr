## ADDED Requirements

### Requirement: 开发 PR 验证必须按证据 owner 分配平台
Buildr 面向 `dev` 的 PR verification MUST 由 macOS 执行主要 changed/affected plan及其 admission wave，并 MUST 从同一 changed base 条件执行适用的 Browser capability。Windows MUST 只执行单一 verification registry 显式声明的平台敏感 development owners；workflow MUST NOT 复制测试文件清单或在 macOS/Windows 重复完整 affected plan。

#### Scenario: 普通非平台修改进入 dev
- **WHEN** PR changed paths 不命中任何 Windows platform-sensitive development owner
- **THEN** macOS MUST 执行主要 affected/admission feedback
- **AND** Windows projection MUST 明确没有适用步骤且不得运行完整 affected plan

#### Scenario: Windows高风险路径进入 dev
- **WHEN** PR changed paths 命中 registry 中声明 `developmentRunners: [windows]` 的 owner inputs
- **THEN** Windows runner MUST 执行该 owner及其registry依赖和资源边界
- **AND** MUST NOT 重复执行与平台无关的完整 Fast、Contract、Integration或System集合

#### Scenario: Browser-owned路径进入 dev
- **WHEN** macOS Browser plan 对 PR changed base 返回 `selected`
- **THEN** CI MUST 准备 Buildr Web依赖并执行同一base的 affected Browser verification
- **AND** MUST 保留 selector plan 与 job outcome，使 0 selector 不得冒充 Browser evidence

#### Scenario: Candidate topology 保持稳定
- **WHEN** `dev → main` 或手工 Candidate verification 运行
- **THEN** 现有 macOS/Windows Candidate shards、唯一 tarball与closed evidence aggregate MUST 保持完整
- **AND** 稳定 `Candidate gate` 名称、macOS runner与 branch protection兼容性 MUST NOT 因开发反馈重编排而改变
