## MODIFIED Requirements

### Requirement: Git worktree provider 必须只返回窄 Git evidence
Buildr MUST以`buildr.git-worktree-provider/v1`表达Git worktree provider，并 MUST让默认`task-worktree` provider只拥有repository plan、checkout、branch、HEAD、remote、clean、worktree registration、由Task Environment提交的确定性integrated evidence与Git cleanup effects。provider evidence MUST使用`buildr.git-worktree-evidence/v1`；它 MUST NOT判断或保存Task Environment的runtime/CLI/依赖、总`ready`、恢复、动态资源、Agent session或总cleanup结论。正常交付的integrated evidence MAY是Task branch对delivery ref的ancestor，也 MAY是Finish提供且provider能独立复算的Task Contribution equivalence；两者都 MUST绑定精确Task checkout/source snapshot、baseline、carrier与target ref，不能由调用方claimed outcome替代。

#### Scenario: 创建默认单仓 worktree
- **WHEN** Task Environment为Workspace root选择Git worktree provider
- **THEN** provider MUST在`.worktrees/<task-id>`创建或复用root repository worktree
- **AND** MUST返回可复核的repository、checkout、branch、HEAD、clean与registration evidence

#### Scenario: 创建显式多 repo worktrees
- **WHEN** Task Environment提供一个或多个显式Project/Service selectors
- **THEN** provider MUST从canonical registries与实际Git boundaries解析source path、remote和integration branch
- **AND** MUST将每个nested worktree放在环境checkout内对应的canonical `source.path`
- **AND** MUST NOT自动包含全部repositories、按remote URL猜范围或把独立repository合并成共享index

#### Scenario: repository plan 存在冲突
- **WHEN** selector无效、remote/branch identity冲突、目标被父repository跟踪、路径越界、已有未知文件或被其他worktree占用
- **THEN** provider MUST在任何`git worktree add`前fail closed
- **AND** MUST返回失败selector、声明/实际identity与未执行effects

#### Scenario: 多 repo 创建中途失败
- **WHEN** 完整预检通过后一个nested worktree创建失败
- **THEN** provider MUST保留已成功创建的checkouts和分支并返回逐repository evidence
- **AND** Task Environment MUST在同一Environment Receipt中记录`blocked`，相同plan重试 MUST幂等复用匹配checkouts

#### Scenario: provider 被直接检查
- **WHEN** 调用方执行provider-level worktree inspect
- **THEN** 结果 MUST只报告当前Git evidence和本次effects
- **AND** MUST NOT返回或暗示Environment `ready`、execution binding、runtime projection、依赖或session adoption

#### Scenario: ancestor关系证明正常集成
- **WHEN** Task Environment提供matching evidence、delivery ref包含Task branch HEAD且worktree没有source drift
- **THEN** provider MUST按现有ancestor integrated evidence执行精确cleanup
- **AND** MUST保留其他任务与远端refs

#### Scenario: 等价任务贡献证明正常集成
- **WHEN** Task branch因隔离carrier re-application不是delivery ref祖先，但Task Environment提供source snapshot、原任务基线、Delivery Baseline、carrier/target ref与Task Contribution identity
- **THEN** provider MUST从当前Task worktree与Git objects独立复算原/应用后delta identities，并只在完全相等且target等于carrier时视为integrated
- **AND** MUST NOT修改Task worktree/branch、使用路径无重叠推断语义安全或信任caller claimed equivalence

#### Scenario: provider 执行清理
- **WHEN** Task Environment提供匹配evidence的正常交付或明确放弃清理授权
- **THEN** provider MUST只删除精确Task-owned worktrees/本地分支/evidence，并保留其他任务和远端refs
- **AND** identity、ownership、贡献等价或授权不匹配时 MUST零删除失败

### Requirement: Task Environment 必须统一编排安全 cleanup
Task Environment MUST独占Task级环境cleanup编排和结果。正常完成时，它 MUST只在Task Finish提供每个工作范围的已交付identity与清理资格后停止资源、调用provider cleanup并解除占用；对于隔离Delivery Carrier，Environment MUST把bounded Task Contribution proof交给Git provider复核，而不是要求Finish改写原Task branch以制造ancestor关系。明确放弃时，它 MAY在上层已经处置关联Change/保留事实且ownership可证明后清理Task-owned dirty资源。Task Environment MUST NOT执行commit、merge、push、远端删除、语义交付判断或Retrospective。

#### Scenario: 正常完成后清理
- **WHEN** Finish handoff证明全部工作范围已交付且可清理，资源与provider evidence均匹配
- **THEN** Task Environment MUST按资源依赖顺序停止动态资源，再调用各scope provider cleanup并解除共享根占用
- **AND** Environment Receipt MUST保留removed/retained resources、provider results与最终cleanup status

#### Scenario: 隔离carrier交付后清理原Task worktree
- **WHEN** Finish提供可独立复算的Task Contribution proof，target ref等于carrier，且当前Task source snapshot未漂移
- **THEN** Environment MUST允许Git provider以该等价proof确认integrated并清理原Task worktree/branch
- **AND** MUST不要求原Task branch成为target祖先或修改Candidate generation

#### Scenario: Finish 请求清理但资源仍阻塞
- **WHEN** 任一Preview/process/container仍运行、provider identity不匹配、worktree source drift、integrated/contribution proof不成立或其他Task仍占用资源
- **THEN** cleanup MUST返回`blocked`并保留所有仍用于恢复的环境与carrier内容
- **AND** Finish MUST只恢复cleanup，不得重跑prepare、verify或deliver

#### Scenario: 用户明确放弃独占 dirty worktree
- **WHEN** 上层提供明确abandon authorization，关联Change/保留事实已处置，且provider evidence证明dirty worktree全部属于该Task
- **THEN** Task Environment MAY请求provider删除该Task-owned checkout、未共享本地分支与资源
- **AND** MUST记录放弃授权和实际removed evidence，不要求第二次普通cleanup确认

#### Scenario: 放弃共享根但 ownership 不清
- **WHEN** 非Git/shared execution root混有来源不明或其他Task改动
- **THEN** Task Environment MUST保留该内容并返回`blocked`或明确retained result
- **AND** MUST NOT因Task已放弃而清空、回滚或删除整个共享根

#### Scenario: 清理其他并行任务
- **WHEN** 同一Workspace/Git common-dir还存在其他Task receipts、worktrees、previews、ports或branches
- **THEN** cleanup MUST只操作当前Environment Receipt精确登记且provider已证明ownership的资源
- **AND** 其他任务的文件、进程、refs、evidence与receipts MUST保持不变

#### Scenario: 清理成功后的最小留痕
- **WHEN** 全部适用资源已删除或按明确决定安全保留
- **THEN** Buildr MUST在原`environment.json`保留Task/Workspace identity、完成时间、最终status与最小处置摘要
- **AND** MUST NOT删除Task Record、Development/Review/Verification/Finish Result或Retrospective
