## ADDED Requirements

### Requirement: Buildr 必须提供可发布的 Project 验证执行器
Buildr MUST 在产品 `src/` runtime 中提供正式验证执行器，并通过 `buildr verification run` 对任意已登记 Project 执行 `verification.yml` 声明的 `affected` 或 `candidate` 保证；该入口 MUST 能从 checkout CLI 与已安装 npm CLI 使用，且 MUST NOT 依赖 Buildr 开发仓库的 `test/`、`scripts/` 或产品专用 registry。

#### Scenario: 普通 Workspace 使用已安装 CLI 验证 Project
- **WHEN** 普通 Buildr Workspace 登记 Project、声明 `verification.yml`，并通过已安装 package 运行 `buildr verification run --project <code> --level affected|candidate --json`
- **THEN** Buildr MUST 从该 Project 解析适用能力并执行所请求保证
- **AND** 执行 MUST 不读取 Buildr 产品 checkout 的测试编排文件

#### Scenario: 调用方提供 task environment context
- **WHEN** 调用方同时提供 canonical task environment identity
- **THEN** 执行器 MUST 核对 owner、receipt、repository membership、allowed execution roots 和当前 candidates 后再启动命令
- **AND** 任一上下文不匹配时 MUST fail closed 且不得启动验证 worker

### Requirement: 正式执行器必须并发调度 DAG 并协调跨任务资源
验证执行器 MUST 按 `verification.yml` 的依赖、适用范围与 supersedes 生成有向无环计划，在同一 run 内并发执行已就绪且资源兼容的能力，并 MUST 对 `isolated`、`namespaced`、`coordinated`、`external` 资源策略采用可解释的执行与等待语义。

#### Scenario: 独立能力在同一 run 并发执行
- **WHEN** 两个已就绪能力没有依赖关系且资源策略允许并行
- **THEN** 执行器 MUST 允许二者重叠执行
- **AND** overall duration MUST 使用进程外单调时钟测量，不得相加 worker duration 冒充 wall-clock

#### Scenario: 两个 task 竞争 coordinated 资源
- **WHEN** 两个验证 run 在同一 Git common-dir 范围竞争相同 coordinated resource key
- **THEN** Buildr MUST 使用包含 task、environment、run、token、heartbeat 与 expiry 的跨进程 lease 串行化持有者
- **AND** 等待、取得、续租、精确释放和过期接管 MUST 进入结构化 evidence

#### Scenario: supersedes 消除重复检查
- **WHEN** 被选中的可信上层能力显式 supersedes 同一候选上的底层能力
- **THEN** 计划 MUST 只执行上层能力并记录底层能力的 superseded 决策
- **AND** 未声明 supersedes 的 Candidate required gate MUST NOT 被推断删除

### Requirement: 正式执行器必须生成可复用且可清理的 evidence
验证执行器 MUST 输出绑定 Project policy、所请求保证、task context（如有）、repository candidates、实际 cwd、命令终态、资源事件、真实 wall-clock 与 evidence lifecycle 的版本化摘要；Task Finish provider MUST 能对该摘要执行 `inspect`、按需 `execute` 并在所有 consumer 完成后 `cleanup`。

#### Scenario: Candidate run 成功
- **WHEN** 所有 Candidate required gate 完整结束且 candidate identity 与执行后内容一致
- **THEN** summary MUST 返回 `candidateCompleteness: confirmed`、非空 `evidenceIdentity`、每项终态和 evidence reference
- **AND** Task Finish MUST 能在候选未变化时复用该 evidence 而不重复启动 executor

#### Scenario: worker 缺少完整终态
- **WHEN** worker 超时、异常退出或没有产生可解析的完整结果
- **THEN** run MUST 失败并记录 exit code、signal、stdout、stderr、owner 和已取得资源
- **AND** cleanup MUST 精确释放本 run 持有的 lease，且不得释放其他 task 的资源
