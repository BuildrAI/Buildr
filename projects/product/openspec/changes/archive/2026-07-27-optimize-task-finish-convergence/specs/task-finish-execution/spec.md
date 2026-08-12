## ADDED Requirements

### Requirement: Task Finish 必须在集成后收敛 retained Workspace
Task Finish MUST 在 integration 与 push 已通过后、清理 task environment 前执行独立的 retained Workspace convergence step。该步骤 MUST 使用明确的 retained Workspace root、retained checkout 绝对 CLI invocation、Agent identity 与完整 changed paths，MUST NOT 使用当前 cwd、task checkout 路径猜测或重新运行正式 Candidate。

#### Scenario: 普通实现不影响 runtime 或默认入口
- **WHEN** integration-push 已通过且 changed paths 不命中 runtime、默认 CLI 或 Local App 入口
- **THEN** retained convergence MUST 只执行 retained Workspace doctor 并记录其他动作 not-applicable
- **AND** MUST NOT 运行 sync、CLI 安装、Local App 安装或完整验证

#### Scenario: runtime 资产受影响
- **WHEN** changed paths 命中 Rules、Skills、Components、Commands、runtime targets 或对应 manifests
- **THEN** retained convergence MUST 使用 retained CLI 对 retained Workspace 执行 doctor-before、sync 和 doctor-after
- **AND** doctor-after MUST 证明当前 Agent runtime ready

#### Scenario: 默认入口受影响
- **WHEN** changed paths 命中默认 CLI 或 Local App launcher/runtime 入口
- **THEN** retained convergence evidence MUST 把精确入口影响交给 runtime-install provider
- **AND** 未受影响的入口 MUST 返回 not-applicable 而不是重复安装

### Requirement: Retained convergence 必须支持精确恢复
Retained convergence MUST 把 retained root、CLI identity、target observation、changed paths 与影响计划纳入 step fingerprint，并 MUST 只使自身、runtime-install 与 cleanup 下游失效。已通过的 Candidate、integration 和 push MUST 保持有效。

#### Scenario: retained doctor 失败
- **WHEN** doctor-before、sync 或 doctor-after 失败
- **THEN** finish run MUST 在 retained-convergence blocked 并保存失败阶段证据
- **AND** resume MUST NOT 重复 formal assurance、integration 或 push

#### Scenario: 输入不足
- **WHEN** retained root、retained CLI invocation、Agent identity 或 changed paths 缺失
- **THEN** Action Registry MUST 返回 input-required 并且零命令执行
- **AND** MUST NOT 从 task receipt、cwd 或 Git 全量扫描猜测缺失输入

### Requirement: Retained convergence evidence 必须披露影响与动作
Retained convergence evidence MUST 记录 retained Workspace 与 CLI identity、changed paths 摘要、runtime/CLI/Local App impact、未分类路径、实际 stages、跳过原因和最终 doctor 状态。未知路径 MUST 可见，但 MUST NOT 自动扩大为默认入口安装。

#### Scenario: 路径未分类
- **WHEN** changed paths 包含未被当前影响规则识别的 Product 路径
- **THEN** evidence MUST 记录 unknown paths 并继续执行 retained doctor
- **AND** MUST NOT 因未知路径自动运行全部 sync、安装或 Candidate
