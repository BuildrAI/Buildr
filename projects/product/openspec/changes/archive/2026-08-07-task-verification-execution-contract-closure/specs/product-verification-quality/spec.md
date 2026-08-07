## ADDED Requirements

### Requirement: 正式执行的 changed capability 必须自带可解析输入
Buildr Product 已登记为 Project Verification capability 的 changed selector command MUST 在正式 `buildr verification run` 中拥有闭合的 changed-path 输入契约。该 capability MAY 优先接受调用方显式提供的 changed paths；未提供时 MUST 使用自身声明的 Git/base 事实或返回可执行的 input diagnostic。通用 Verification runner MUST NOT 为某个 Product capability 硬编码其 selector 选择逻辑。

#### Scenario: Browser capability 使用显式 changed paths
- **WHEN** `product.browser-smoke` execution 收到合法的 `BUILDR_CHANGED_PATHS_JSON`
- **THEN** dispatcher MUST 校验并使用该路径集合生成 selector plan
- **AND** formal `verification run` MUST 能启动 Browser capability，不要求 Agent 额外手工修改命令

#### Scenario: Browser capability 从 Git fallback 选择
- **WHEN** `product.browser-smoke` execution 未收到 `BUILDR_CHANGED_PATHS_JSON` 且 execution root 能解析 verification base
- **THEN** dispatcher MUST 从 Git diff 收集 Product-relative changed paths并生成与显式输入一致的 selector plan
- **AND** selector plan MUST 保留 affected/full 模式、选择原因和未映射路径的 fail-closed 行为

#### Scenario: Browser capability 缺少可解析输入
- **WHEN** `product.browser-smoke` execution 没有显式 changed paths 且无法解析 Git verification base
- **THEN** dispatcher MUST 在启动 Chrome 前返回稳定的 input/base diagnostic
- **AND** MUST NOT 将该情况报告为 Browser 页面或业务交互失败

