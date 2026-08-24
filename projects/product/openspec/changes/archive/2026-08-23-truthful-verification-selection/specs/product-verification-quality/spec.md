## MODIFIED Requirements

### Requirement: changed 验证必须从 Git diff 生成可解释计划
Buildr Product MUST 提供 `test:changed`，根据默认 Git diff、显式 `--base <ref>` 或显式 Product 路径匹配真实 verifier owner inputs，展开真实依赖并去重；规划结果 MUST 解释每个 step 的选择原因和未映射路径，且通用源码目录 glob MUST NOT 迫使无关 Unit、Contract 与 Fast Integration 同时运行。Unknown path 或 direct production owner gap MUST 作为执行前选择错误返回，MUST NOT 通过扩展完整 Candidate profile 代替 owner。

#### Scenario: 普通文档发生小改动
- **WHEN** changed paths 只匹配普通非发布 Markdown 文档
- **THEN** planner MUST 选择轻量 docs quality step 及其真实依赖
- **AND** planner MUST NOT 选择完整 Candidate、Workspace E2E、tarball install 或 runtime parity

#### Scenario: 单一实现 owner 发生改动
- **WHEN** changed path 只匹配一个 focused verifier 或一个低成本测试 owner
- **THEN** planner MUST 选择该 owner 及其真实依赖
- **AND** planner MUST NOT 因架构或 profile 建议顺序展开全部低成本测试层

#### Scenario: 使用 Git base 规划
- **WHEN** 维护者运行 `npm run test:changed -- --base <ref>`
- **THEN** planner MUST 使用 `<ref>...HEAD` 的 merge-base diff，并合并 staged、unstaged 和 Product 内 untracked paths
- **AND** 输出 MUST 标识实际 base 与每个 matched path

#### Scenario: 使用显式路径规划
- **WHEN** 维护者向 `test:changed` 传入一个或多个 Product 相对路径
- **THEN** planner MUST 只使用这些规范化路径进行匹配
- **AND** 绝对路径、越界路径或不存在的 selector option MUST fail closed

#### Scenario: 改动路径没有 owner
- **WHEN** 任一 Product changed path 未匹配 ownership authority 且未被显式 ignore 规则覆盖，或 direct production owner audit 存在 gap
- **THEN** planner MUST 在运行 admission 或业务 verifier 前 fail closed
- **AND** 诊断 MUST 一次列出全部未映射路径与 production owner gaps、已发现的 broad owners 和补充验证所有权的 next action
- **AND** planner MUST NOT 因该 gap 选择或执行完整 Candidate profile

#### Scenario: 只查看计划
- **WHEN** 维护者使用 `--plan` 或 `--json`
- **THEN** planner MUST 输出规范化 changed paths、计划状态、按拓扑排序的 steps、依赖展开、选择原因与预算估算
- **AND** planner MUST NOT 启动验证进程或创建候选制品

## ADDED Requirements

### Requirement: changed selection ownership 与 Candidate execution graph 必须具有独立 authority
Buildr Product MUST 在物理上分离路径 ownership mapping 与 Candidate execution graph。Ownership authority MUST 保存 changed path 到 primary verifier owner 的映射、ignore/delegation 与生产源码 owner 例外；execution graph MUST 保存命令、profile、dependency、resource、timeout、budget 与 Candidate membership。Planner MUST 根据 authority 类型判断 affected 或 Full，MUST NOT 通过中央文件名或任意内容 diff 猜测长期语义。

#### Scenario: 只增加或重命名路径 owner
- **WHEN** 维护者只修改 ownership authority 中的路径映射且 execution graph 不变
- **THEN** changed planner MUST 选择 registry contract、verification admission 与该 owner 的 affected 证据
- **AND** planner MUST NOT 仅因 ownership authority 变化选择全部 Candidate steps

#### Scenario: 修改执行图或调度语义
- **WHEN** 维护者修改 step command、profile、dependency、resource、scheduler、executor 或 execution boundary
- **THEN** changed planner MUST 选择 Full
- **AND** scope reason MUST 使用结构化 execution-semantics code 指明触发 authority

#### Scenario: 只修改 timing 报告或预算声明
- **WHEN** 维护者只修改目标预算、timing evidence schema 的展示或报告格式且未改变 scheduler、resource 或 executor 语义
- **THEN** changed planner MUST 选择对应 timing/contract affected owners
- **AND** planner MUST NOT 选择无关业务 lifecycle journeys

### Requirement: 验证计划必须在执行前证明总预算声明可行
Buildr Product MUST 对准备执行的 changed Full 与 Candidate DAG 计算总目标工作量、全局容量下限、依赖关键路径和各协调资源容量下限，并 MUST 以这些约束的最大值作为最小可行时长。计划 MUST 将该估算与声明总预算比较；声明预算低于理论下限时 MUST 在启动 verifier 前 fail closed，不得仅在执行后输出 budget warning。

#### Scenario: 总目标工作量超过全局容量预算
- **WHEN** step 目标耗时总和除以 execution profile 的全局容量后仍超过声明总预算
- **THEN** plan MUST 标记 `feasible: false` 并报告 total target duration、capacity 与对应 lower bound
- **AND** runner MUST NOT 启动任何 verifier

#### Scenario: 依赖或资源形成更高下限
- **WHEN** DAG 最长依赖链或某个资源 claim 的目标耗时除以资源容量形成更高下限
- **THEN** plan MUST 使用最高约束作为 `minimumFeasibleDurationMs`
- **AND** 输出 MUST 标识限制性 dependency path 或 resource 与 capacity

#### Scenario: 预算声明数学上可行
- **WHEN** 声明总预算不低于全部理论下限且所有 executable step 都有目标预算
- **THEN** plan MUST 标记 `feasible: true` 并输出 step count、total target duration 与各类 lower bound
- **AND** 该结论 MUST 只表示声明数学上可行，不得替代实际 timing、正确性或 Candidate 通过证据

#### Scenario: step 缺少目标预算
- **WHEN** 一个准备执行的 step 没有可用目标预算
- **THEN** plan MUST 列出缺失预算的 step 并将预算可行性视为未证明
- **AND** runner MUST 在补齐声明或显式选择无总预算的非准入入口前 fail closed
