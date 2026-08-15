## ADDED Requirements

### Requirement: 生产源码必须具有显式领域验证所有权
Buildr Product MUST 为 `src/application` 与 `src/infrastructure` 的生产模块维护可执行的 affected owner 契约；通用 Unit、Candidate 制品或 broad application payload 匹配 MUST NOT 单独充当领域 owner。每个生产模块 MUST 命中至少一个直接 Integration/System/Static owner，或进入包含 owner 与理由的显式闭合 allowlist；新增或移除路径造成缺口时 planner MUST 在启动 verifier 前 fail closed。

#### Scenario: 已有领域 Integration 的源码发生改变
- **WHEN** Task Entry、Task Retrospective 或其他已有领域 Integration 证据的生产源码进入 changed paths
- **THEN** planner MUST 选择包含该真实测试文件的有界领域 Integration owner
- **AND** MUST NOT 仅返回 Unit、Candidate tarball 或 application payload owner

#### Scenario: 新生产模块没有直接 owner
- **WHEN** 新增 `src/application` 或 `src/infrastructure` 模块且没有直接 owner或显式 allowlist 条目
- **THEN** planner 与 repository contract MUST 在启动测试进程前报告生产源码 owner coverage gap
- **AND** MUST NOT 根据相似文件名、CLI 可达性或 broad `src/**` 匹配猜测领域覆盖

#### Scenario: 生产模块明确只适用现有非领域证据
- **WHEN** 维护者确认某模块没有真实领域 Integration/System 场景且已有 owner 足以证明其风险
- **THEN** registry MAY 使用包含精确路径、owner 和理由的显式 allowlist
- **AND** 已存在直接领域 Integration 测试的模块 MUST NOT 通过 allowlist 绕过选择

### Requirement: 专属 Integration slice 必须保持唯一 primary ownership
Buildr Product MUST 从同一 registry 派生专属 Integration slice 与 general suite exclusions。Candidate 中每个 Integration 测试文件 MUST 恰好由一个 primary owner执行；直接 Integration 层入口 MAY 继续运行完整文件集合用于定位，但 Candidate general 与专属 slice MUST NOT 重复执行同一文件。

#### Scenario: Task read model 源码发生改变
- **WHEN** changed paths 命中 Task Entry、Overview、Planning Identity 或 Retrospective 实现
- **THEN** planner MUST 只选择对应有界 Task read-model Integration slice及其必要依赖
- **AND** MUST NOT 因该路径选择完整 general Integration owner

#### Scenario: Candidate 聚合全部 Integration
- **WHEN** 维护者或 CI 运行 Candidate profile
- **THEN** general Integration 与全部专属 slice 的测试文件并集 MUST 等于完整 Candidate Integration 文件集合
- **AND** 交集 MUST 为空

### Requirement: 本地 affected 与 Full 必须先通过同次 admission wave
Buildr 本地 `test:changed` 与 `test:candidate` MUST 在同一 verification execution 中先运行低成本 Fast steps；当原计划包含验证框架 canary时 MUST 同时纳入 admission wave。所有非 admission steps MUST 等待 admission 全部通过；任一 admission step失败时，尚未启动的重型 Integration、System、Workspace、package 或 artifact steps MUST 被 blocked且不得产生执行副作用。

#### Scenario: 验证框架变化包含廉价错误
- **WHEN** registry、planner、changed runner 或 execution contract 变化使 Fast 或 verification canary失败
- **THEN** 本地 affected/full MUST 在 admission wave结束时返回失败
- **AND** MUST NOT 启动依赖该 wave 的重型 Candidate steps

#### Scenario: 普通领域变化运行 affected
- **WHEN** changed plan非空且没有选择 verification canary
- **THEN** runner MUST 先运行 Fast admission并在通过后运行原 affected owners
- **AND** MUST NOT无条件加入与该领域无关的 System canary

#### Scenario: GitHub Candidate 运行分布式投影
- **WHEN** `dev → main`或手工 Candidate 使用 GitHub shard topology
- **THEN** 现有 preflight phase MUST 包含 Fast owners与verification canary，并在失败时阻止 artifact和verification phases
- **AND** stable `Candidate gate`、artifact复用与后续shard边界 MUST 保持不变

### Requirement: 同一验证执行必须复用 admission evidence
Buildr MUST 通过单一去重 DAG 组合 admission 与主计划；同一 step identity 在一次 changed/candidate execution中 MUST 最多执行一次，且 timing summary、diagnostics和最终状态 MUST属于同一run。系统 MUST NOT 为复用 admission 结果建立跨 invocation cache、第二Result store或调用方管理的 evidence writer。

#### Scenario: Fast step同时属于原始 Full plan
- **WHEN** Candidate plan已经包含 Unit、Contract或其他Fast step
- **THEN** admission composition MUST 复用该 step identity并只执行一次
- **AND** 后续步骤 MUST 把同一passed result作为依赖完成事实

#### Scenario: Admission 通过后主 DAG 失败
- **WHEN** admission steps全部passed但后续重型step失败
- **THEN** 最终 timing summary MUST 同时保留admission与主DAG结果
- **AND** 整体结果 MUST failed且不得把早期passed evidence误报为独立正式Verification Result
