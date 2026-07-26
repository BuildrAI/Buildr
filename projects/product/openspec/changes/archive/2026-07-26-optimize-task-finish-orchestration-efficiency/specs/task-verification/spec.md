## ADDED Requirements

### Requirement: Verification provider 必须聚合 required capabilities
Task verification provider MUST 在一次正式 execute 内调度全部适用 required capabilities，对无依赖且副作用允许的检查并行执行，并返回统一、identity-bound summary。Consumer MUST NOT 依赖临时 shell、日志 tail或手写 duration来组合正式 evidence。

#### Scenario: 多个 required capability 可并行
- **WHEN** affected assurance选择多个无依赖、effects兼容且已授权的 required capabilities
- **THEN** provider MUST 在同一 execution run内并行调度并等待全部完成
- **AND** totalDurationMs MUST 表示聚合 run真实 wall-clock而非各检查耗时之和

#### Scenario: 一个 capability失败
- **WHEN** 任一 required capability失败或其 process cleanup不完整
- **THEN** overall verification MUST failed或incomplete
- **AND** summary MUST 返回失败项、process ownership与可恢复动作

### Requirement: Verification summary 必须支持低噪声消费
Verification provider MUST 默认返回 policy、candidate、selected capability结果、总 wall-clock、最慢项、失败项和日志引用的 compact summary。逐测试成功日志只在显式 full detail或诊断需要时返回，不得让正常成功输出成为主要 Agent context负担。

#### Scenario: 全部检查通过
- **WHEN** required assurance全部通过且无需人工诊断
- **THEN** provider MUST 返回计数、duration、candidate identity、coverage和稳定 evidence reference
- **AND** MUST NOT 默认内联全部成功测试输出

#### Scenario: 检查失败
- **WHEN** 一个或多个检查失败
- **THEN** provider MUST 内联最小 actionable failure detail并引用完整日志
- **AND** MUST 保留其他检查的结构化状态和真实并行 wall-clock
