## ADDED Requirements

### Requirement: 收尾必须独立于研发交接且按动作检查安全
收尾与交付在日常意图中 MAY表示同一结束目标；task-finish MUST根据真实目标处理成果、已有记录及安全清理，MUST不要求候选、交接或统一验证链。

#### Scenario: 四类组合
- **WHEN** 任务有无 Buildr 记录与有无 Git 管理形成四种组合
- **THEN** 仅调用实际适用能力，无记录不建记录，无 Git 不制造提交

#### Scenario: 已有检查仍适用
- **WHEN** 内容和检查相关条件未改变
- **THEN** 复用已有结果，不重跑全量验证

#### Scenario: 具体检查缺口
- **WHEN** 存在相关内容变化或已知错误
- **THEN** 只检查受影响内容并如实报告，不创建统一门禁

#### Scenario: 部分成功
- **WHEN** 交付成立但登记或清理失败
- **THEN** 保留交付，继续安全必要动作，说明遗留

## REMOVED Requirements

### Requirement: Task Finish workflow 必须把产品缺陷退回研发
**Reason**: 旧执行链及强制交接已退役。
**Migration**: 独立收尾使用当前成果与原资源能力，保留历史，不补旧运行。

#### Scenario: 退出旧要求
- **WHEN** 用户要求收尾
- **THEN** 不执行本条旧流程，具体安全检查由动作所有者承担。

### Requirement: Task Finish 必须只按 Workspace 根 runtime source 选择 render
**Reason**: 旧执行链及强制交接已退役。
**Migration**: 独立收尾使用当前成果与原资源能力，保留历史，不补旧运行。

#### Scenario: 退出旧要求
- **WHEN** 用户要求收尾
- **THEN** 不执行本条旧流程，具体安全检查由动作所有者承担。

### Requirement: Task Finish 与 Task Record complete 必须保持不同用户语义
**Reason**: 旧执行链及强制交接已退役。
**Migration**: 独立收尾使用当前成果与原资源能力，保留历史，不补旧运行。

#### Scenario: 退出旧要求
- **WHEN** 用户要求收尾
- **THEN** 不执行本条旧流程，具体安全检查由动作所有者承担。

### Requirement: 正式收尾前必须轻量确认贡献与主工作区对齐
**Reason**: 旧执行链及强制交接已退役。
**Migration**: 独立收尾使用当前成果与原资源能力，保留历史，不补旧运行。

#### Scenario: 退出旧要求
- **WHEN** 用户要求收尾
- **THEN** 不执行本条旧流程，具体安全检查由动作所有者承担。

### Requirement: Agent 必须有界自动重试已解除 foreign 阻断的同一自举收尾
**Reason**: 旧执行链及强制交接已退役。
**Migration**: 独立收尾使用当前成果与原资源能力，保留历史，不补旧运行。

#### Scenario: 退出旧要求
- **WHEN** 用户要求收尾
- **THEN** 不执行本条旧流程，具体安全检查由动作所有者承担。

### Requirement: 放弃任务后必须用产品入口释放未交付 Finish 占用
**Reason**: 旧执行链及强制交接已退役。
**Migration**: 独立收尾使用当前成果与原资源能力，保留历史，不补旧运行。

#### Scenario: 退出旧要求
- **WHEN** 用户要求收尾
- **THEN** 不执行本条旧流程，具体安全检查由动作所有者承担。

### Requirement: Task Finish 不得用会话宿主覆盖 Environment adapter
**Reason**: 旧执行链及强制交接已退役。
**Migration**: 独立收尾使用当前成果与原资源能力，保留历史，不补旧运行。

#### Scenario: 退出旧要求
- **WHEN** 用户要求收尾
- **THEN** 不执行本条旧流程，具体安全检查由动作所有者承担。

## MODIFIED Requirements

### Requirement: 任务 Skills 必须消费新的 Environment capability topology
本条研发顺序仅约束显式采用的研发能力；收尾独立触发，MUST不消费研发交接或通过 task next 推荐，已有验证能力只保护自身动作。
Buildr package/runtime capability graph MUST让`task-environment`提供`buildr.task-environment/v1`，让`task-worktree`只提供`buildr.git-worktree-provider/v1`，并让`task-development`required消费Environment、让`task-finish`按实际需要调用Environment cleanup且不依赖Development handoff。Git provider MAY对无需Git的Environment降级。

#### Scenario: task-triage 进入正式执行
- **WHEN** task-triage已确认formal execution分支
- **THEN** 它 MUST optional消费`buildr.task-environment/v1`并在该分支要求provider ready
- **AND** 纯讨论、只读或Task外分支 MUST不因Environment provider缺失而阻塞

#### Scenario: Task Environment 选择 Git isolation
- **WHEN** receipt plan需要一个或多个Git worktrees
- **THEN** task-environment MUST解析selected `buildr.git-worktree-provider/v1`并只消费其Git evidence
- **AND** provider missing/ambiguous/blocked MUST使prepare blocked

#### Scenario: Task Development取得执行context
- **WHEN** Development观察Content Target或请求formal Verification
- **THEN** MUST通过selected `buildr.task-environment/v1`取得matching scopes/allowed roots
- **AND** MUST NOT依赖Git worktree Skill identity或手写execution roots

#### Scenario: Task Finish 清理环境
- **WHEN** Finish已交付equivalent carrier并进入cleanup
- **THEN** Finish MUST调用selected`buildr.task-environment/v1`交接delivery/cleanup eligibility
- **AND** MUST NOT直接扫描资源或调用Git provider cleanup

#### Scenario: provider 替换
- **WHEN** compatible internal providers替换默认Environment/worktree
- **THEN** consumers MUST按capability identity与binding继续工作
- **AND** MUST NOT根据Skill ID、目录名或旧receipt schema硬编码调用

### Requirement: task-verification Skill 必须作为语义验证入口
本条研发顺序仅约束显式采用的研发能力；收尾独立触发，MUST不消费研发交接或通过 task next 推荐，已有验证能力只保护自身动作。
Buildr MUST交付`task-verification` Workspace Skill并通过selected `buildr.task-verification/v3` provider工作。Skill MUST理解Task Intent与Development提供的stable Content Target，读取Task scope内Project v2 declarations、选择适用已有能力、取得transient execution evidence、提炼current facts，并只在完整结论形成后调用Task Verification Application record。

#### Scenario: 用户要求验证正式 Task
- **WHEN** 用户或Task Development提供正式Task、明确stable Content Target identity与policy decision
- **THEN** Agent MUST先inspect existing current Result/declarations
- **AND** stale、missing或policy要求额外能力时 MUST执行适用能力并形成完整replacement

#### Scenario: Development请求formal Verification
- **WHEN** Task Development提供正式Task、明确Content Target identity与policy decision
- **THEN** Agent MUST先inspect existing current Result/declarations
- **AND** stale、missing或policy要求额外能力时 MUST执行适用能力并形成完整replacement

#### Scenario: Finish请求Verification
- **WHEN** 用户已要求独立收尾
- **THEN** task-verification MUST不再被Finish路由或调用
- **AND** 任何Verification需求 MUST返回Task Development重新建立stable target

#### Scenario: 普通一次性测试
- **WHEN** 用户只要求运行一条测试且没有正式Task/target identity
- **THEN** Skill MAY执行并报告transient facts
- **AND** MUST NOT创建空Task、伪Content Target或Task Verification Result

### Requirement: task-development Skill 必须编排P0.5 authority顺序
本条研发顺序仅约束显式采用的研发能力；收尾独立触发，MUST不消费研发交接或通过 task next 推荐，已有验证能力只保护自身动作。

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

### Requirement: 日常正式任务引导必须按阶段装配上下文
本条研发顺序仅约束显式采用的研发能力；收尾独立触发，MUST不消费研发交接或通过 task next 推荐，已有验证能力只保护自身动作。
Buildr 内置任务 Skills MUST 引导 Agent 只在当前动作成为 next executable action 时读取该动作所需的 Skill、capability contract、selected provider 与直接 authority，并 MUST 将后续阶段的专业上下文延后到对应动作开始前。该引导 MUST NOT允许跳过已触发 Skill、required Rule、provider contract、授权或 result evidence。

#### Scenario: Triage 正在选择任务路径
- **WHEN** Agent 正在判断语义治理、执行形态、repository set 与下一 provider action
- **THEN** `task-triage` MUST只要求读取当前分支决策和立即执行动作所需的 binding
- **AND** MUST不要求在 proposal 前预先读取 Verification、Completion 等尚未到达阶段的完整 provider 指引

#### Scenario: 已具备进入 proposal 的事实
- **WHEN** 用户已授权实现，Task、Environment 与 Development begin 所需事实已经完整
- **THEN** guidance MUST引导 Agent 进入 proposal 或当前首个研发动作
- **AND** MUST不因收集非当前阶段信息、预读下游 Skills 或建立额外进度 authority而延迟该动作

#### Scenario: 首次修改前建立 source map
- **WHEN** Agent 准备修改 proposal、Skill、代码、测试或当前知识
- **THEN** guidance MUST要求从直接相关的 canonical specs、current knowledge、实现、测试与 registry 建立一次有界 authority source map
- **AND** 后续 MUST只在 scope、authority 或相关事实变化时增量刷新，不得把该 map 写成新的产品 authority或反复全量扫描

### Requirement: Agent 必须消费正式任务入口的同源引导
本条研发顺序仅约束显式采用的研发能力；收尾独立触发，MUST不消费研发交接或通过 task next 推荐，已有验证能力只保护自身动作。
Buildr随包Task Skills MUST消费产品返回的同源输入发现与typed next，不得复制Plan request schema、把pre-admission数据伪装为recovery pointer或重复已current的Parent Acceptance。

#### Scenario: Verification preparation blocked
- **WHEN** `verification run` compact summary以`verification.preparation_blocked`退出且`recovery`为null
- **THEN** `task-verification` MUST按primary failure指引对同一 invocation追加`--detail full`读取`admission.recovery.planRequest`
- **AND** MUST把该Plan request原样交给Task Environment流程，不得启动新的Verification run或补造Execution Record

#### Scenario: Agent形成 Environment Plan input
- **WHEN** Agent需要调用`task environment plan record`
- **THEN** `task-environment` MUST优先消费该action的`--schema|--example`发现实际输入结构
- **AND** MUST不从Skill正文维护第二份schema或绕过Application运行态校验

#### Scenario: Parent Acceptance 已current
- **WHEN** Parent coordination返回current Acceptance且顶层`task next`给出Development后续动作
- **THEN** `task-development` MUST继续消费该typed next
- **AND** MUST不再次执行`accept-parent`或自行硬编码Finish动作
