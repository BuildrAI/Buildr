## ADDED Requirements

### Requirement: Git Task Finish 必须按 Environment repository set 交付
Git-backed Task Finish MUST以 matching Task Environment 提供的完整 repository set 为输入，按稳定 selector 为每个独立 Git repository 形成 repository-scoped contribution、target、baseline、carrier、equivalence、delivery、readback与cleanup facts。Task Finish MUST保持顶层固定五阶段，并 MUST NOT把 repository 暴露为公共workflow step、caller selection或第二adapter。

#### Scenario: 只有 Service repository 有贡献
- **WHEN** Environment 同时包含 Workspace 根与独立 Service repository，Workspace 根 Task Contribution 为空而 Service repository 有贡献
- **THEN** Task Finish MUST把 Workspace repository 标记为`not-applicable/no-contribution`，只为 Service repository执行prepare、verify和deliver
- **AND** MUST NOT为 Workspace repository创建carrier、校验baseline HEAD提交消息、取得target lease、push或远端回读

#### Scenario: 多个 repository 都有贡献
- **WHEN** Environment 中两个或以上独立 repository 都有非空 Task Contribution
- **THEN** prepare与verify MUST在任何push前为全部有贡献repository形成current等价carrier
- **AND** deliver MUST按冻结selector顺序逐repository取得隔离target lease并执行交付

#### Scenario: repository target 来自 retained checkout
- **WHEN** Environment repository 的`startPoint`是`HEAD`、remote ref或其他checkout表达式
- **THEN** Task Finish MUST从该repository的retained checkout当前符号分支解析target branch
- **AND** MUST NOT把`startPoint`直接当作任一repository的交付分支identity

#### Scenario: 多仓库使用单值 target override
- **WHEN** 两个或以上有贡献repository的run请求携带单值`--target-branch`或`--remote`
- **THEN** entry MUST在创建run和任何delivery mutation前以歧义诊断fail closed
- **AND** MUST NOT把该值猜测应用到全部repository

### Requirement: 无贡献 repository 必须跳过 Delivery Carrier
当 repository 的冻结Task source tree等于其original baseline tree时，Task Finish MUST把该repository的交付处置记录为`not-applicable/no-contribution`。该repository MUST NOT创建Delivery Carrier或空commit，MUST NOT执行commit-message校验、remote target alignment、fast-forward、push或remote readback；Task Finish仍 MUST保存可由Task Environment cleanup独立复算的no-contribution proof。

#### Scenario: baseline HEAD消息与冻结消息不同
- **WHEN** repository没有Task Contribution，且retained baseline HEAD的提交消息不同于本次冻结Task Finish消息
- **THEN** prepare MUST保持该repository为not-applicable并继续处理其他有贡献repository
- **AND** MUST NOT返回`task-finish.commit-message-mismatch`

#### Scenario: carrier apply产生非空tree delta
- **WHEN** 有贡献repository在Delivery Baseline上机械应用后产生新tree并由本次Finish创建carrier commit
- **THEN** Task Finish MUST校验该carrier commit的规范化subject、body与trailer identity
- **AND** baseline HEAD或其他未由本次carrier拥有的commit MUST NOT充当该校验对象

#### Scenario: 显式零差异适配
- **WHEN** adaptation-required repository由Agent按既有exact token确认最新baseline已满足冻结语义并接受zero-delta adaptation
- **THEN** Task Finish MUST继续按agent-reviewed Delivery Adaptation规则核验run-owned carrier
- **AND** MUST NOT把该路径重新分类为普通no-contribution或省略其适配证据

### Requirement: 多仓库 delivery 必须保存部分成功事实并可恢复
Task Finish MUST在固定deliver阶段内于每个repository完成普通push和remote readback后立即持久化repository-scoped delivery checkpoint。后续repository blocked、failed或进程恢复时，产品 MUST保留已交付repository的真实事实，MUST NOT报告跨remote原子回滚，也 MUST NOT重复push已证明contained的repository。

#### Scenario: 第二个 repository target race
- **WHEN** 第一个repository已完成push/readback，而第二个repository在lease内发现target已前进
- **THEN** run MUST保存第一个repository为delivered，并为第二个repository返回current exact resume token
- **AND** 恢复 MUST只重建或交付尚未完成的repository

#### Scenario: 已交付 repository 在恢复时仍 contained
- **WHEN** resume重新观察到已交付repository的remote target等于或可精确证明包含其carrier
- **THEN** Task Finish MUST复用保存的delivery facts并跳过重复transition和push
- **AND** MUST继续处理最早未完成repository

#### Scenario: 已交付 repository 无法再证明 contained
- **WHEN** resume无法证明已交付repository的carrier仍被remote target包含
- **THEN** run MUST保持blocked并报告该repository的target/containment诊断
- **AND** MUST NOTforce push、回滚其他remote或把事实改写为未交付

### Requirement: 多仓库 cleanup 必须覆盖全部 Environment repository
Finish cleanup MUST向 retained Task Environment manager提交每个Environment repository的integrated ref与cleanup proof。有贡献repository MUST使用carrier contribution proof；无贡献repository MUST使用独立no-contribution proof。Task Environment MUST在全部proof可复算后按既有ownership规则一并清理所有Task worktree、任务分支和provider evidence。

#### Scenario: 无贡献 Workspace 根与已交付 Service 一并清理
- **WHEN** Workspace根没有贡献、Service carrier已交付且Finish completion facts durable
- **THEN** Environment cleanup MUST分别复算Workspace no-contribution与Service carrier contribution
- **AND** MUST在同一次Environment cleanup中移除两个repository的Task worktree和任务分支

#### Scenario: 无贡献 checkout 含空提交
- **WHEN** 无贡献repository的Task branch HEAD不是target祖先，但其deliverable source tree仍精确等于冻结original baseline tree
- **THEN** Git worktree provider MUST接受可复算的no-contribution proof作为cleanup eligibility
- **AND** MUST NOT要求创建空carrier commit、改写Task branch或把空提交push到target

#### Scenario: 任一 cleanup proof 漂移
- **WHEN** 任一repository的source tree、carrier、target ref或ownership无法匹配其保存proof
- **THEN** Environment cleanup MUST保持resumable blocked并保留尚未安全处置的全部现场
- **AND** Finish MUST NOT重跑已完成remote delivery或直接删除Environment worktree

### Requirement: 历史无副作用提交消息误失败必须可安全替换
新runtime读取到旧单仓库run因`task-finish.commit-message-mismatch`在carrier ownership形成前terminal failed时，只有能证明该run没有carrier、lease、resume、delivery、retained、prepared completion或cleanup facts，且verify、deliver、cleanup从未开始，才 MUST允许同一首次`task finish run`命令退休旧current并创建新的repository-set run。其他旧run MUST保持原冻结identity与fail-closed恢复语义。

#### Scenario: 重跑同一首次命令
- **WHEN** 旧run精确满足无副作用误失败条件，current Development handoff未变，调用方再次提供同一规范化commit message
- **THEN** 产品 MUST保留旧Execution Record、以类型化superseded事实退休旧current并创建新run
- **AND** MUST NOT要求旧run resume token、重新形成Development handoff或修改Task Environment

#### Scenario: 旧run存在不确定副作用
- **WHEN** 旧run有carrier、lease、resume、后续phase attempt、delivery/retained/cleanup fact或无法证明failure形态
- **THEN** 产品 MUST返回current-run identity conflict或原run的合法恢复动作
- **AND** MUST NOT仅因carrier字段为空就自动替换run

## MODIFIED Requirements

### Requirement: Task Finish CLI detail 投影必须与执行 authority 分离
Task Finish Application MUST从同一个canonical `buildr.task-finish-result/v3`确定性生成CLI detail投影。`full` MUST原样保留repository-set Result；`compact` MUST通过closed字段白名单生成`buildr.task-finish-compact-result/v1`，且 MUST不写SQLite、不改变run/result、不查询第二authority、不创建新的恢复或diagnostics store。detail选择 MUST只影响CLI JSON序列化，不得改变五阶段执行、逐repository resume、Delivery Carrier、Execution Record、Task terminal或Environment cleanup。旧v2 Result只允许有界读取与兼容compact投影，新写入 MUST使用v3。

#### Scenario: complete Result 的两种投影
- **WHEN** 同一complete v3 Result分别以compact与full读取
- **THEN** 两者 MUST表达相同run、Task、handoff、Candidate、Content Target、status与completion结论
- **AND** full MUST保留repository-scoped delivery authority，compact MUST保持既有closed字段并省略repository数组和full diagnostics

#### Scenario: blocked Result 可恢复
- **WHEN** current run因某个repository的Delivery Adaptation、target race、containment或cleanup暂态条件blocked
- **THEN** full MUST标识该repository的真实状态，compact MUST保留primary failure、唯一next action与matching resume
- **AND** detail投影 MUST不重复交付已完成repository或改写repository checkpoints

#### Scenario: compact 投影失败
- **WHEN** canonical Result缺少compact契约要求的run、identity、status或恢复事实
- **THEN** Application MUST fail closed并返回受控CLI错误
- **AND** MUST不补造identity、修改canonical Result或降级为对象展开

### Requirement: 当前 Task Finish 必须保持单一窄交付 adapter
Buildr MUST在只有一个真实交付 adapter 时直接使用当前 Product/Git adapter，并 MUST把通用 Task Finish 边界限制为current Development Handoff、Environment repository set、Delivery Carrier preparation、carrier equivalence、delivery effects、cleanup eligibility与run/resume facts。Git remote、branch、fast-forward与push MUST留在Git delivery实现，Buildr sync/Doctor/CLI/Buildr Web install MUST留在Product retained activation，Task-owned resource/provider cleanup MUST只由Task Environment Application执行。Buildr MUST NOT因当前Git adapter支持多个repository而创建公共adapter registry、插件协议、第二capability graph或通用跨remote transaction/state-machine框架。

#### Scenario: 当前只有 Git direct-to-target adapter
- **WHEN** package与runtime只登记当前Buildr Product的Git direct-to-target delivery
- **THEN** Task Finish MUST直接选择该确定性Product adapter并以固定五阶段处理Environment中一个或多个独立Git repository
- **AND** MUST NOT要求调用方选择adapter kind、provider id、repository execution plan或未来delivery type

#### Scenario: Product retained activation适用
- **WHEN** Workspace repository的Delivery Carrier改变runtime、默认CLI或Buildr Web正式影响路径
- **THEN** 当前Product adapter MUST在deliver内执行适用的retained sync/Doctor/install并记录not-applicable或真实结果
- **AND** 非Workspace repository与通用Development handoff、Candidate或Task Environment schema MUST NOT获得Buildr/Git/Node/npm产品常量

#### Scenario: multi-repo具备完整当前语义
- **WHEN** Git-backed multi-repo路径具备Environment repository authority、逐repository equivalence、target authorization、部分成功恢复、cleanup eligibility与独立E2E fixture
- **THEN** 当前Product/Git adapter MUST直接支持该路径并如实保存repository-scoped事实
- **AND** MUST NOT把它实现为第二adapter、caller编排或跨remote原子事务

#### Scenario: 没有满足条件的新交付路径
- **WHEN** non-Git、task-branch、PR、release或deploy没有同时具备真实consumer、持久目标、equivalence、authorization、cleanup eligibility与独立E2E fixture
- **THEN** 当前Change MUST保持这些路径未实现
- **AND** MUST NOT为Roadmap完整性预建selection、registry、receipt或兼容层
