## ADDED Requirements

### Requirement: Candidate capability 必须有独立止损与实时可观测生命周期
Buildr Candidate runner MUST 为每个 capability 使用与非阻断 timing budget 分离的显式墙钟 timeout，并 MUST 在 spawn、周期 heartbeat、terminal completion 与 cleanup 阶段输出可审计事实。timeout、取消或进程退出异常时，runner MUST 回收完整 owned process group 和已观测后代；无法证明回收完成 MUST fail closed。

#### Scenario: capability 永久不退出
- **WHEN** 确定性 fixture 启动 capability、派生后代进程并永久等待
- **THEN** runner MUST 在 capability timeout 加有界 cleanup grace 内返回 `timed-out`
- **AND** 日志 MUST 标识 capability、elapsed、PID/PGID、completed/total 与 cleanup outcome
- **AND** 根进程和后代 MUST 全部退出，不等待外层 job timeout

#### Scenario: capability 正常完成
- **WHEN** capability 写入 stdout/stderr 后正常退出
- **THEN** runner MUST 在其他 active capability 结束前立即输出 completion event
- **AND** stdout/stderr、phase timing、diagnostic digest 与 terminal status MUST 保持完整一致

### Requirement: Candidate shard 必须增量保留非聚合 checkpoint
Candidate shard MUST 在每个 capability terminal completion 后原子保存绑定 source、registry、artifact、shard 和 expected step set 的 checkpoint。Checkpoint MUST 明确为非聚合中间态；aggregate gate MUST 继续只接受完整 terminal shard evidence，并 MUST 对缺失、部分、跨 source 或跨 artifact evidence fail closed。

#### Scenario: 一个 capability 超时前已有 capability 完成
- **WHEN** shard 中若干 capability 已完成，随后一个 capability 超时
- **THEN** artifact MUST 保留已完成 capability 的 stdout/stderr、completion facts 与最新 checkpoint
- **AND** shard MUST NOT生成可被 aggregate 接受的 passed terminal evidence

#### Scenario: shard 全部通过
- **WHEN** expected step set 中每个 capability 都 terminal passed且 cleanup clean
- **THEN** shard MUST 写完整 terminal evidence
- **AND** aggregate MUST继续核对全部权威 shard、source SHA、registry identity 与同一 Candidate artifact

### Requirement: core macOS Candidate 必须按语义 owner 分片且保持完整覆盖
Buildr MUST 从一个权威 core macOS registry 集合投影 3–4 个语义 shard，并 MUST 自动证明每个原 capability 有且只有一个 shard owner。重 Git/SQLite/CLI 生命周期 capability MUST 声明与测量一致的资源压力；workspace-saturating capacity 为 1 时 scheduler MUST NOT 让两个此类 capability 并发。

#### Scenario: registry 或 workflow 发生变化
- **WHEN** core capability、shard mapping、workflow job、artifact name、`needs` 或 aggregate input 被修改
- **THEN** contract test MUST 比较权威集合、唯一 owner、workflow job 与 aggregate expected shard
- **AND** 任一缺失、重复或漂移 MUST 在 Candidate capability 启动前失败

#### Scenario: 两个 workspace-saturating capability 同时 ready
- **WHEN** scheduler profile 对 `workspace-saturating` 声明 capacity 1
- **THEN** scheduler MUST 只启动其中一个并让另一个保持 queued
- **AND** timing summary MUST 记录资源分配和 queue duration

### Requirement: process lineage 采样调整必须绑定可复核基准
Buildr MUST 为 process lineage sampler 提供同 tree benchmark，记录采样周期、缓存窗口、tracker 数、样本次数与 wall/user/system timing。采样参数只能在基准显示成本下降且 timeout/后代回收正确性测试保持通过后改变；sampling MUST NOT被删除或被描述为已确认挂起根因。

#### Scenario: 调整采样周期或缓存
- **WHEN** 维护者提出减少 `ps` 调用或延长缓存窗口
- **THEN** 变更 MUST 附带相同 harness 的前后多轮 timing 和中位数
- **AND** 确定性后代进程 fixture MUST继续证明 lineage 观察与完整回收

### Requirement: retained cleanup fixture 必须拒绝测试文件作为产品入口
Task Finish retained cleanup 测试 MUST 显式证明 `currentProductInvocation` 解析到 delivered `bin/buildr.mjs`，并 MUST在任何调用前拒绝 Node test file、test runner argv 或非产品 CLI entry。fixture helper MUST NOT默认从 `process.argv[1]` 推断 Buildr CLI。

#### Scenario: 测试进程入口指向当前 test file
- **WHEN** retained cleanup fixture 在 Node test runner 中解析 product invocation
- **THEN** helper MUST使用显式 delivered CLI path或返回确定性错误
- **AND** MUST NOT再次执行 test file或形成递归测试进程
