## ADDED Requirements

### Requirement: Task Finish 必须连续执行可机械验证的 provider action
Task Finish MUST 允许 action registry 将具有稳定 product handler、结构化授权、effects、输入和 result contract 的 selected provider 动作登记为 `provider-executable`，并 MUST 在正常无冲突路径连续执行这些动作。只有需要语义判断、缺少输入、授权不足、结果无法验证或 provider 没有 product handler 时才 MUST 停止并返回明确 handoff。

#### Scenario: 连续执行确定 provider
- **WHEN** 当前及后续步骤的 selected provider 均提供已登记 product handler，输入、授权和 lease 可验证，且结果均通过 contract assertion
- **THEN** `task finish run` MUST 自动领取 attempt、执行 provider、记录 observation/evidence/effect 并推进 checkpoint
- **AND** MUST 直到真实停止边界才返回，不要求 Agent 逐步 claim 和 complete

#### Scenario: Provider 进入语义分支
- **WHEN** provider 返回 Git 内容冲突、OpenSpec 语义冲突、修复决策或其他需要人类判断的结果
- **THEN** executor MUST 保留最后成功 checkpoint 并返回 `agent-provider-required` 或更具体的稳定停止状态
- **AND** MUST NOT 猜测决定、扩大授权或把未执行 effect 标记完成

#### Scenario: Provider 结果不可核验
- **WHEN** product handler 的结果缺少 contract 要求的 identity、ref transition、verification summary 或 cleanup receipt
- **THEN** 当前 attempt MUST blocked 且保存 bounded diagnostic
- **AND** 后续步骤 MUST NOT 执行

### Requirement: Retained impact 分类必须覆盖默认 CLI 实现
Retained convergence MUST 使用 Product-relative canonical path policy 分类默认入口影响，并 MUST 将 Buildr CLI 入口、安装映射和生产 `services/buildr/src/**/*.mjs` 视为默认 CLI 影响。测试、fixtures、OpenSpec artifacts 和真正未知路径 MUST NOT 仅因位于 Product 内就触发入口安装。

#### Scenario: Application domain 源码变化
- **WHEN** changed paths 包含 `projects/product/services/buildr/src/application/**/*.mjs`
- **THEN** retained impact MUST 设置 `requiresCliInstall: true` 并把精确路径交给 runtime-install provider
- **AND** MUST NOT 将该路径报告为 `default-cli-not-affected`

#### Scenario: 只有测试变化
- **WHEN** changed paths 只包含 `services/buildr/test/**`
- **THEN** retained convergence MUST 运行 doctor 并将 CLI install 标记为 not-applicable
- **AND** MUST NOT 重装默认 CLI

### Requirement: Task Finish 必须传递 retained runtime identity
Task Finish MUST 将 retained checkout 已核验的 Node executable、版本、CLI source 和 target identity 传给 runtime-install provider，并 MUST 在安装前后记录实际使用的 runtime identity。交互 shell PATH MUST NOT 覆盖 receipt-bound runtime。

#### Scenario: Shell 默认 Node 不受支持
- **WHEN** retained receipt 提供受支持 Node executable，而交互 shell PATH 首个 Node 版本低于产品最低要求
- **THEN** runtime-install MUST 使用 receipt-bound Node 完成安装与 post-install doctor
- **AND** MUST NOT 先以不受支持 Node 启动一次失败尝试

#### Scenario: Runtime identity 已漂移
- **WHEN** 安装前观察到 Node executable、版本或 CLI source 与 retained fingerprint 不一致
- **THEN** runtime-install MUST 阻塞并返回 before/observed identity 与 next action
- **AND** MUST NOT 使用任意 PATH fallback 静默继续

### Requirement: Task Finish 正常路径必须报告自动化效率证据
Buildr MUST 通过真实无冲突 Task Finish journey 记录 product/provider execution coverage、Agent handoff 数、CLI invocation 数、checkpoint wait、orchestration gap 和 end-to-end wall-clock。验证 MUST 以动作覆盖与往返结构作为稳定验收，不得用固定绝对耗时掩盖机器差异。

#### Scenario: 无冲突代码任务完成收尾
- **WHEN** 候选验证通过、目标 ref 未漂移、provider 均返回确定结果且 cleanup 可证明安全
- **THEN** completion receipt MUST 列出自动执行的 provider actions、真实停止边界数量和未观测区间
- **AND** journey test MUST 证明正常路径没有逐步骤 Agent completion
