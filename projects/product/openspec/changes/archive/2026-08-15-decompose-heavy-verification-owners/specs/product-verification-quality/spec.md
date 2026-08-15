## ADDED Requirements

### Requirement: 日常 affected 重型验证必须使用最小可解释领域 DAG
Buildr Product MUST 根据直接实现 ownership、测试主证据、fixture、隔离方式和生命周期组织重型 verification owner；普通领域变化 MUST 只选择证明该风险所需的最小可解释重型 DAG，而 MUST NOT 因共享 general Integration、Verification System、Workspace System 或 Task Finish 聚合入口执行无关 sibling 领域。

#### Scenario: 普通领域实现发生改变
- **WHEN** changed path属于 Task、声明、OpenSpec、验证编排、Runtime、发布、数据存储、Project/Service、Worktree 或 Task Finish 的直接实现边界
- **THEN** planner MUST 选择该领域的 primary owner及真实 artifact dependency
- **AND** planner MUST NOT选择无直接证据关系的 sibling重型 owner
- **AND** Fast与适用 admission MUST 在重型 executor前执行并传播失败

#### Scenario: 聚合 owner 包含可独立选择的领域
- **WHEN** 一个 Integration 或 System owner包含变化频率、输入路径与生命周期不同的多个稳定领域集合
- **THEN** registry MUST 将集合声明为可独立 focus、计时和诊断的 primary owners
- **AND** 原稳定 identity MUST保留给语义连续的主领域
- **AND** aggregate/general runner MUST从同一 registry派生排除或文件集合

#### Scenario: 拆分后执行 Candidate
- **WHEN** Candidate profile或Candidate CI执行完整产品回归
- **THEN** 拆分前后的 Integration/System 行为文件并集 MUST相同
- **AND** 每个文件 MUST恰好由一个 primary owner执行且同一plan最多执行一次
- **AND** required owner MUST全部进入本地Candidate和原适用CI shard

### Requirement: 性能优化必须使用可复核的选择与计时证据
Buildr Product MUST 使用代表 changed-plan owner集合、registry调度成本和同一tree focused成功计时评估日常验证性能；一次共享runner墙钟或预算 warning MUST NOT单独决定 owner边界或永久预算。

#### Scenario: 验收日常开发性能优化
- **WHEN** 重型owner拓扑发生改变
- **THEN** verifier MUST在启动重型executor前证明文件union、唯一ownership、Candidate/CI coverage与代表changed paths
- **AND** 新增或显著改变的重型owner MUST在同一tree至少取得两轮focused成功样本
- **AND** 性能结论 MUST分别说明affected选择改善、focused耗时与Candidate完整覆盖

#### Scenario: 完整生命周期不适合继续拆分
- **WHEN** 一个超预算step持有单一完整lifecycle、共享不可变准备或不可拆分的跨组件acceptance事实
- **THEN** 维护者 MUST保留唯一primary owner而不得创建重复准备或重复happy-path证据
- **AND** 非阻断预算 MUST结合focused成功样本、full-load observation与合理波动余量独立校准
- **AND** budget adjustment MUST NOT改变step status、Candidate覆盖或失败传播
