## MODIFIED Requirements

### Requirement: 实现型 workflow 必须绑定 task execution context
Buildr 的 task triage、Task Environment 与 OpenSpec Skills MUST 在写入前核对 matching Environment Receipt、实际 execution binding、Task checkout/provider evidence 与可信 retained Environment Manager。普通 workflow MUST NOT 要求 retained manager content identity 与 Receipt 创建指纹永久匹配，也 MUST NOT 以 session root 等于 environment root 或 Agent session adoption receipt 作为执行前置条件。

#### Scenario: Triage 准备 Environment 后在原对话继续
- **WHEN** task triage 取得 matching `ready` Environment Receipt，且当前 Agent 能使用结果中的明确 target/workdir 与执行 CLI
- **THEN** Task Environment MUST 返回 task、Workspace、工作范围、允许执行根、Task checkout/provider、CLI 与 runtime projection identity
- **AND** 当前用户对话 MUST 能在 binding 通过后继续写入，不要求迁移 Agent session或匹配 retained manager content hash

#### Scenario: 明确工作目录绑定 Environment
- **WHEN** 命令 target、workdir、scope membership、provider/Task checkout、执行 CLI、Runtime/依赖和 projection identity 匹配 Environment Receipt 的最新真实 probe
- **THEN** workflow MUST 将其视为有效 execution binding
- **AND** MUST NOT 因 Agent session 从 canonical Workspace 启动或 retained Buildr 已升级而阻塞 proposal、实现、构建、测试或验证

#### Scenario: Execution binding 漂移
- **WHEN** target、workdir、scope/provider/Task checkout identity、Runtime/CLI、依赖或 runtime projection 不再匹配 receipt
- **THEN** workflow MUST fail closed 并报告精确差异
- **AND** MUST NOT 通过直接调用 worktree provider、创建第二份 checkout 或沿用旧 `ready` 规避 mismatch

#### Scenario: 只有 retained manager content identity 改变
- **WHEN** Task execution binding 全部匹配，当前 retained Environment Manager 可信且 source clean，但其 content identity 与 Receipt 创建指纹不同
- **THEN** workflow MUST 继续使用同一 Task Environment binding
- **AND** MUST NOT 自动更新 Task checkout、失效 Review/Verification evidence 或建立新的 lifecycle generation
