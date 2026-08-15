## MODIFIED Requirements

### Requirement: task-development Skill 必须编排P0.5 authority顺序

Buildr MUST交付`task-development` Workspace Skill并提供`buildr.task-development@2`。Skill MUST从proposal、design或直接实现等首个正式研发动作开始维护planning current snapshot，在内容稳定后建立Content Target与policy、调用formal Verification、冻结Candidate、按适用性调用或明确处置Completion Review，并形成decision/handoff；它 MUST通过内部Application driver工作且 MUST NOT新增公共CLI或Buildr Web writer。

#### Scenario: OpenSpec planning入口登记事实
- **WHEN** active Task在ready Environment中创建或更新proposal/design
- **THEN** 若该文档属于尚未绑定的OpenSpec变更，OpenSpec sidebar MUST先完成脚手架与`add-change`，再调用Development begin，然后才写入artifact，并在artifact形成后登记其专业authority、portable reference与identity
- **AND** MUST NOT把artifact正文复制到Development Receipt
- **AND** MUST NOT对空变更列表 begin 后再绑定同一变更

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

## ADDED Requirements

### Requirement: 正式收尾前必须轻量确认贡献与主工作区对齐

Task Finish Skill MUST 在调用产品 `task finish run` 之前，向用户或当前事实确认两件事：任务分支上的任务贡献已经提交；本机主工作区（retained Workspace）已经对齐本次交付的目标远端。该提醒 MUST NOT 替代产品入口一次聚合 Environment / Development / 交付缺口；Skill MUST 仍直接启动 canonical `task finish run`，并在返回 `task_finish.entry_gaps` 时按三个模块完整转述。

#### Scenario: 收尾前发现贡献未提交或主工作区落后

- **WHEN** 用户要求正式收尾，且任务分支仍有未提交贡献，或本机主工作区落后目标远端
- **THEN** Skill MUST 先说明这两项风险，并在用户确认处理或明确继续之前停止调用产品收尾
- **AND** MUST NOT 把该提醒实现为新的 `task_finish.entry_gaps` 缺口码

#### Scenario: 已对齐后仍走产品聚合入口

- **WHEN** 贡献已提交且主工作区已对齐目标远端，用户要求正式收尾
- **THEN** Skill MUST 直接调用 canonical `task finish run`
- **AND** MUST NOT 在调用产品前自行链式做 Environment → handoff → target/remote 的 fail-fast

### Requirement: OpenSpec 变更必须按可绑定顺序接入任务

当正式 Task 需要 OpenSpec 变更时，Buildr OpenSpec 侧栏 MUST 要求固定顺序：先创建变更脚手架，再把该变更绑定到 Task Record，再调用 Task Development `begin`（disposition 覆盖任务上的全部变更），最后才写入 proposal/design/specs/tasks。侧栏 MUST NOT 要求在变更尚未绑定到任务时，为即将绑定的变更提前 `begin`。

#### Scenario: 新建带变更的规划

- **WHEN** active Task 已有 ready Environment，即将创建 OpenSpec 变更并写入规划文档
- **THEN** Agent MUST 先 `openspec new change` 形成可解析脚手架，再 `task update --add-change`，再 Development `begin`，然后才写 artifacts
- **AND** MUST NOT 在脚手架不存在时调用 `add-change`

#### Scenario: 禁止先 begin 再绑定变更

- **WHEN** Task Record 尚无该变更引用，Agent 即将写入该变更的 proposal 或 design
- **THEN** 侧栏 MUST 阻止先对空变更列表 `begin`、写文档后再 `add-change`
- **AND** 若任务上下文因事后绑定变更而过期，Agent MUST 重新 `begin` 或 `planning`，不得沿用过期研发回执
