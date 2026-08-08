## MODIFIED Requirements

### Requirement: Task Environment Application 必须提供唯一确定性操作边界
Buildr MUST由共享Task Environment Application实现Plan `record/inspect`、Environment `prepare`、live `inspect`、saved-current read、`resource register/release`与`cleanup`，并 MUST让CLI、Skill、Local App、Preview和Finish复用对应Application action。`prepare` MUST幂等承担首次准备与恢复；live `inspect` MUST只读观察matching current的Plan、executable/input identity和output facts；saved-current read MUST只读取Workspace SQLite current。

#### Scenario: Agent 准备或恢复环境
- **WHEN** Agent运行`buildr task environment prepare <task-id>`并可选提供Plan
- **THEN** CLI MUST只把结构化参数交给Application并返回当前`ready / blocked`结果
- **AND** 已有matching current时 MUST从同一环境恢复，不得创建第二份环境或单独restore命令

#### Scenario: CLI只读检查环境
- **WHEN** CLI `inspect`请求当前Task Environment
- **THEN** Application MUST只读比较current Plan、resolved executable/input identities和expected outputs
- **AND** MUST不写Receipt、执行Plan command、创建目录、启动/停止资源或cleanup

#### Scenario: Local App读取保存事实
- **WHEN** Local App GET请求Environment read model
- **THEN** Application MUST只读取最近一次正式lifecycle action保存的SQLite current
- **AND** MUST不探测文件系统、执行Plan或形成新的ready结论

#### Scenario: 人或产品模块只读检查环境
- **WHEN** CLI `inspect`、Local App或其他产品模块请求当前Task Environment read model
- **THEN** CLI `inspect` MUST执行零写入live observation，其他saved-current consumer MUST只读取SQLite current
- **AND** 任一读取方 MUST不直接解析Receipt文件、手写ready/cleanup结论或在GET中补写projection

#### Scenario: 产品模块登记持久资源
- **WHEN** 已登记provider创建或释放Task-owned持久资源
- **THEN** 产品模块 MUST直接调用Application `resource register/release`
- **AND** 公共CLI MUST不暴露这两个内部action

#### Scenario: CLI 执行 cleanup
- **WHEN** 调用方运行`cleanup`
- **THEN** Application MUST验证Finish handoff或明确abandon authorization再编排providers
- **AND** CLI MUST不接受任意cleanup shell、完整Receipt或caller-authored next state

### Requirement: Task checkout/provider evidence 必须是 Environment 的源码版本基础
Task Environment MUST以Receipt scopes、actual execution roots和provider evidence表达Task源码版本基础。retained Workspace后续前进 MUST不自动更新或重写Task checkout；`prepare/inspect` MUST按该checkout中的current Plan inputs、outputs、CLI、projection和资源事实判断ready。

#### Scenario: retained Workspace 从 M1 前进到 M2
- **WHEN** Task checkout仍在M1而retained Workspace前进到M2
- **THEN** Environment MUST继续观察M1的provider和Preparation facts
- **AND** MUST不因controller content identity不同自动使Plan、Review或Verification失效

#### Scenario: Task 尚未选择吸收 M2
- **WHEN** 没有显式Git operation改变Task checkout
- **THEN** Task Environment MUST不fetch、rebase、merge、reset或同步源码
- **AND** MUST保留原start point、HEAD与execution roots

#### Scenario: Task 显式更新到 M2
- **WHEN** 显式Git operation改变Task checkout
- **THEN** 下一次prepare/inspect MUST按新checkout的Plan inputs、outputs、CLI和projection重新判断ready
- **AND** Review/Verification MUST独立判断其target applicability

## REMOVED Requirements

### Requirement: Environment Receipt 必须是唯一环境 authority

### Requirement: Environment prepare 必须确定性准备并真实探测执行基础

### Requirement: Environment restore 必须按 Task ID 串行复核真实事实

## ADDED Requirements

### Requirement: Environment Receipt 必须以 Plan 事实作为唯一环境 authority
Buildr MUST在Workspace SQLite `task_environment_current`中按`task_id`唯一维护经过Domain校验的`buildr.task-environment-receipt/v4`。同一current row MUST独占Plan、逐Service/Step current与prepared facts、scope聚合、`ready / blocked`、执行位置、Runtime/CLI/projection、动态资源、恢复和cleanup；Git/provider evidence与Task Record MUST不竞争这些事实。旧Receipt v2/v3 MUST只兼容读取并在active状态要求显式Agent Plan升级。

#### Scenario: 首次准备环境
- **WHEN** 有效Task首次执行prepare
- **THEN** Buildr MUST在外部Environment effect前创建最小current row
- **AND** 后续成功或失败步骤 MUST更新同一row

#### Scenario: Receipt 保存 Plan 和逐步事实
- **WHEN** writer形成v4 current
- **THEN** payload MUST保存规范化Plan/identity、逐Service聚合和逐Step resolved executable、input/output current/prepared facts、required、status、observedAt与最小diagnostic
- **AND** scope `preparation` MUST只保存同一Step facts的聚合probe

#### Scenario: v2 或 v3 active Receipt 被读取
- **WHEN** current仍是legacy schema且没有Agent登记的v1 Plan
- **THEN** live inspect MUST零写入返回blocked legacy diagnostic
- **AND** 只有Plan record或携带Plan的prepare MAY原子升级v4，不得从npm roots自动合成Plan

#### Scenario: Environment Receipt 与 Task Record 共存
- **WHEN** Workspace还存在历史Environment files或其他专业记录
- **THEN** Environment writer MUST只更新SQLite current row
- **AND** MUST不在正常action中读取、更新、删除、移动或回滚任何sibling file

#### Scenario: Receipt 进入 Git 候选
- **WHEN** Git status、初始化或package verification检查Workspace本地Task目录
- **THEN** SQLite current与历史Environment files MUST保持本机排除
- **AND** Buildr MUST不stage、commit、push或声明它们为portable owner

#### Scenario: Receipt 内容边界
- **WHEN** writer形成或更新current
- **THEN** payload MUST只保存环境恢复、真实探测、资源归属和cleanup所需的本机事实
- **AND** MUST不保存Agent session、通用Task计划、Verification Result、凭证、任意shell/env、完整输出或一次性执行标志

#### Scenario: 精确写入失败
- **WHEN** Domain校验、SQLite事务或writer provenance失败
- **THEN** Buildr MUST rollback当前mutation并保留最后一份有效current
- **AND** MUST不修改Task Record或legacy files

### Requirement: Environment prepare 必须按 Agent Plan 确定性准备并真实探测执行基础
Task Environment MUST从canonical Task scope、matching current、Agent登记的Preparation Plan和现有runtime/command authority准备execution roots、Runtime、逐Preparation Step、Workspace CLI与runtime projection。核心 MUST不根据package manager类型选择行为；`ready` MUST来自全部required scope、Service和Step的当前真实facts。

#### Scenario: 全部执行基础通过
- **WHEN** provider/Runtime、每个required Step输出、CLI与projection均ready
- **THEN** Environment MUST写入ready并返回实际execution binding、Plan identity及逐Service/Step facts
- **AND** MUST不返回dependency-root或package-manager专用事实

#### Scenario: 两个 Service 首次准备
- **WHEN** Agent Plan为两个Task-scoped Service分别声明required steps且fresh worktree尚无outputs
- **THEN** prepare MUST按Plan顺序分别执行并返回两个可归因`preparation-step-executed` effects
- **AND** 只有两个Service和其他required foundations均ready后Environment才能ready

#### Scenario: 部分输出缺失
- **WHEN** 一个Service Step identities仍匹配但另一个required Step output缺失
- **THEN** live inspect MUST零写入返回blocked并指出Service/Step
- **AND** 后续prepare MUST只重跑缺失Step

#### Scenario: executable 或 input 漂移
- **WHEN** 当前executable/input identity与prepared identity不同
- **THEN** inspect MUST返回drifted且不执行命令
- **AND** prepare MUST只重跑对应Step并保存新prepared identities

#### Scenario: 所有 Step 仍匹配
- **WHEN** Plan、executable/input prepared identities和outputs全部匹配
- **THEN** prepare MUST复用结果且不重复执行命令
- **AND** MUST不伪造`preparation-step-executed` effect

#### Scenario: required Step 失败
- **WHEN** 某required command退出非零、超时或执行后output不满足声明
- **THEN** Receipt与result MUST保存具体Service/Step、退出或output诊断并使Environment blocked
- **AND** 其他Step成功事实 MUST保留但不得冒充整体成功

#### Scenario: 自举 stable controller
- **WHEN** Buildr在自己的Task worktree中开发候选Task Environment
- **THEN** Environment mutation MUST由retained稳定controller执行Agent Plan
- **AND** candidate CLI MUST不认领或清理自己的Environment

### Requirement: Environment 恢复必须按 Task ID 串行复核 Plan 与真实事实
Task Environment MUST通过canonical Task ID从Workspace SQLite恢复同一Receipt，并 MUST重新探测execution roots、provider、Runtime/CLI、current Plan、Preparation Steps、projection与动态资源。恢复 MUST不按cwd、branch、相同HEAD、Agent session或Project技术栈文件猜测ownership；同一Task保持单一active writer。

#### Scenario: 新 Agent session 恢复 active Task
- **WHEN** Agent按Task ID恢复active Task后请求prepare或inspect
- **THEN** Environment MUST定位同一current与Plan identity
- **AND** MUST在返回ready前重新观察required facts

#### Scenario: 从 task worktree 内恢复
- **WHEN** 请求cwd位于已登记worktree且调用方提供matching Task ID与canonical Workspace
- **THEN** Environment MUST通过SQLite Receipt与provider evidence核对membership
- **AND** MUST不把cwd或branch本身当作ownership证明

#### Scenario: receipt 与实际环境漂移
- **WHEN** execution root、provider、Plan、executable/input、output、projection或资源不再匹配
- **THEN** inspect MUST零写入返回blocked与精确差异
- **AND** prepare MUST只恢复可归因Step，不得创建第二份checkout或沿用旧ready

#### Scenario: Plan 被替换
- **WHEN** Agent record新的Plan identity
- **THEN** Application MUST使旧Step results失效并保留同一current row
- **AND** MUST等待后续prepare执行新Plan

#### Scenario: prepare 恢复 Step 漂移
- **WHEN** 调用方在matching active Environment上重新执行prepare
- **THEN** Application MUST只执行缺失或漂移的required Steps并更新同一current row
- **AND** MUST保留其他current Step、provider与resource ownership事实

#### Scenario: 同一 Task 出现其他 writer 效果
- **WHEN** current已不同于mutation读取依据
- **THEN** mutation MUST停止并返回blocked
- **AND** MUST不自动merge、覆盖或宣称锁/CAS/租约保证
