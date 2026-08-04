## MODIFIED Requirements

### Requirement: 内置任务 Skills 按 capability contract 协作
Buildr内置任务Skills MUST依赖capability contracts而不是硬编码optional Skill identity。`task-development` MUST required消费Task Record、Task Environment、Task Review、Task Verification与current knowledge capabilities，并 MAY optional消费`buildr.task-asset-review/v3`；`task-triage` MAY optional消费`buildr.task-development/v2`以在首个正式研发动作建立聚合事实；`task-finish` MUST required消费`buildr.task-development@2`与Task Environment，MUST不再消费Task Review、Task Verification、current knowledge或task-asset-review authority。

#### Scenario: Task Development使用required providers
- **WHEN** Buildr声明`task-development` builtin
- **THEN** manifest MUST声明`buildr.task-record/v1`、`buildr.task-environment/v1`、`buildr.task-review/v1`、`buildr.task-verification/v3`与`buildr.current-knowledge-maintenance/v2` required dependencies
- **AND** 任一required provider missing/ambiguous/blocked MUST使Development readiness fail closed

#### Scenario: 首个正式研发动作建立聚合事实
- **WHEN** task-triage已经建立active Task与matching ready Environment，并即将进入proposal、design或直接实现
- **THEN** routing MUST调用selected `buildr.task-development/v2` provider的begin action
- **AND** provider缺失或blocked MUST在内容写入前fail closed，不得形成第二个Development writer

#### Scenario: Task Development使用optional asset review
- **WHEN** selected `buildr.task-asset-review/v3` provider ready且Task存在observation
- **THEN** Development MUST在形成Finish handoff前消费其finalize result
- **AND** provider缺失或没有observation MUST保持non-blocking degraded，不创建空observation

#### Scenario: Task Finish消费Development
- **WHEN** Buildr声明`task-finish` builtin
- **THEN** manifest MUST required依赖`buildr.task-development@2`与`buildr.task-environment/v1`
- **AND** MUST删除旧Task Review、Task Verification、current knowledge与task-asset-review dependencies

#### Scenario: provider替换
- **WHEN** compatible provider替换任一默认Skill
- **THEN** consumer MUST按capability identity与selected binding继续工作
- **AND** MUST NOT按Skill ID、目录或store path硬编码调用

#### Scenario: Task Finish 使用 optional v2 provider
- **WHEN** 旧runtime manifest仍把`buildr.task-asset-review/v2`声明为Task Finish optional dependency
- **THEN** P0.5 package切换 MUST从Task Finish移除该binding，并只允许Task Development optional消费`buildr.task-asset-review/v3`
- **AND** runtime MUST NOT同时保留旧Finish finalize route与新Development authority

#### Scenario: Optional provider 缺失
- **WHEN** Task Development的optional`buildr.task-asset-review/v3` provider不可用
- **THEN** Development readiness MUST保持non-blocking degraded
- **AND** 其他required providers与没有observation的正常handoff MUST不受影响

### Requirement: task-development Skill 必须编排P0.5 authority顺序
Buildr MUST交付`task-development` Workspace Skill并提供`buildr.task-development@2`。Skill MUST从proposal、design或直接实现等首个正式研发动作开始维护planning current snapshot，在内容稳定后建立Content Target与policy、调用formal Verification、冻结Candidate、按适用性调用或明确处置Completion Review，并形成decision/handoff；它 MUST通过内部Application driver工作且 MUST NOT新增公共CLI或Local App writer。

#### Scenario: OpenSpec planning入口登记事实
- **WHEN** active Task在ready Environment中创建或更新proposal/design
- **THEN** OpenSpec sidebar MUST先调用Development begin或planning action，并在artifact形成后登记其专业authority、portable reference与identity
- **AND** MUST NOT把artifact正文复制到Development Receipt

#### Scenario: Change任务进入Candidate准备
- **WHEN** active Task包含0..N Change且实现已完成
- **THEN** Skill MUST在Content Target观察前完成适用Change sync/archive/current knowledge/runtime fixed point，并把已有proposal/design/Review等专业facts登记到current planning snapshot
- **AND** 任一内容mutation发生后 MUST重新观察target，不能复用先前Verification

#### Scenario: 无Change普通Workspace进入Candidate准备
- **WHEN** active Task没有OpenSpec且首个正式研发动作为代码实现
- **THEN** Skill MUST以空planning nodes建立Development Receipt并允许实现继续
- **AND** MUST NOT要求proposal、Planning Review、Product code、Service code、Git ref、Node/npm或OpenSpec executable

#### Scenario: runtime发现Development
- **WHEN** supported Agent runtime完成Buildr sync/render
- **THEN** runtime MUST发现`task-development` Skill、`buildr.task-development@2` contract与binding
- **AND** MUST不同时投射v1 provider或旧Finish-owned Candidate/Verification路由
