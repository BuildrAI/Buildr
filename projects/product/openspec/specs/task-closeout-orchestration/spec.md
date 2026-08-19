# task-closeout-orchestration Specification

## Purpose

定义 Agent 调用 Formal Finish 的长等待语义，以及 Buildr 自举 Workspace 在 Finish 后以单一确定性 runner 完成结构化、幂等、可恢复的收尾编排。

## Requirements

### Requirement: Buildr 自举收尾必须由单一确定性 runner 编排
Buildr 自举 Workspace MUST由 `buildr-self-bootstrap-sync` Skill 自身携带的单一确定性 runner消费同一Formal Finish run的current或terminal Result，并按固定阶段完成适用的plan、target lease、workspace sync、精确successor commit、普通push、development Buildr Web安装、retained checkout显式开发入口验证与最终Doctor或same-run resume。Runner MUST通过Product只读入口取得Finish Result与`resolvedContext`，并只通过retained Product内部driver协调target lease，MUST NOT直接import Buildr npm package内部Application模块。Runner源码和入口 MUST NOT进入Buildr用户npm package、`package/targets/**`或普通Workspace Skill集合。Runner MUST NOT要求调用方提交frozen paths、动作分类、成功布尔值、recovery manifest或可编辑execution capsule，MUST NOT把这些动作加入Formal Finish五阶段或普通Workspace，也 MUST NOT安装、删除或验证PATH默认development CLI。

#### Scenario: Complete Result进入自举收尾
- **WHEN** Formal Finish Result为complete且冻结Task Contribution命中至少一个self-bootstrap动作
- **THEN** Agent MUST启动Skill bundled runner入口并由runner形成去重plan、取得target lease、执行适用阶段和返回结构化结果
- **AND** Agent MUST只调用一次runner；真实target occupied或Product返回的恢复边界由同一Task自动等待/恢复，不得用foreign carrier存在性形成额外人工调用流程
- **AND** runner MUST从同一run的Finish Result读取frozen paths、Agent、target branch、remote与final ref

#### Scenario: 普通Workspace或无匹配动作
- **WHEN** canonical Workspace没有匹配的`buildr-self-bootstrap` Component，或frozen paths没有命中任何专属动作
- **THEN** runner MUST返回`not-applicable`且不得获取activation lease或执行sync、Git、Buildr Web安装、开发入口验证、Doctor或Finish resume

#### Scenario: Buildr用户包发布
- **WHEN** Buildr npm package执行发布内容规划或dry-run
- **THEN** package内容 MUST不包含self-bootstrap closeout runner、公开activation lease命令或普通Workspace可编排入口
- **AND** 普通用户安装Buildr或初始化Workspace时 MUST不获得`buildr-self-bootstrap-sync` Skill

### Requirement: Runner 必须保持阶段authority与部分成功事实
Runner MUST把sync、commit、push、Buildr Web install、development entry verification、Doctor和Finish resume表达为独立阶段结果与effects；一次调用只负责确定性排序和交接，MUST NOT把多项结果伪装成原子transaction或写入新的Receipt、数据库、Task Record、Development、Verification、Finish Result或聚合store。任一阶段blocked时 MUST保留已经发生的effects并停止后续不安全动作。

#### Scenario: Commit成功但push失败
- **WHEN** runner已经创建合法successor commit，但普通push被拒绝或远端读回失败
- **THEN** commit阶段 MUST保持passed并报告本地history effect，push阶段 MUST为blocked并报告remote未完成
- **AND** runner MUST NOT reset、amend、force push、切换remote/ref或把整体结果报告为零effect

#### Scenario: 安装失败
- **WHEN** sync/Git阶段已经完成而development Buildr Web安装失败
- **THEN** runner MUST保留已经完成的commit/push/readback事实并停止开发入口验证与finalize
- **AND** MUST NOT重跑Formal Finish、改写Task终态或回滚已经发布的successor commit

#### Scenario: 显式开发入口验证失败
- **WHEN** sync/Git与适用的Buildr Web安装已经完成，但retained `projects/product/buildr`无法启动或身份不一致
- **THEN** development entry verification阶段 MUST为blocked并保留前序effects
- **AND** runner MUST NOT回退到PATH默认`buildr`或进入最终Doctor/Finish resume

### Requirement: Runner 必须可从可重算事实幂等恢复
Runner MUST只根据同一Finish Result、retained Git/ref/remote、当前run/plan successor identity、当前sync输出、installer和Doctor事实判断fresh、fresh-descendant、resume或already-complete；MUST NOT创建持久化runner state。`plan.baseRef` MUST继续绑定Finish frozen ref；动态`activationBaseRef`只有在当前HEAD等于baseRef，或baseRef是当前HEAD的祖先、baseRef到当前HEAD无merge、working tree clean且HEAD与Finish绑定的精确remote/branch一致时才能前进。普通descendant commit的作者、工具与`Buildr-Task` trailer MUST NOT成为activation前置条件；runner MUST记录frozen ref、实际activation base与published linear descendant commits，并 MUST NOT据此声明descendant拥有Task、Verification、Review或Candidate身份。当前HEAD若是本run/plan trailer精确匹配的successor，其parent MUST作为activation base，remote只可等于parent或HEAD。无法证明上述Git、target或current-run identity时 MUST fail closed并保留现场。

#### Scenario: 重跑复用未push的successor commit
- **WHEN** retained HEAD是当前run/plan绑定的精确successor，其parent位于Finish frozen ref的已发布无merge线性descendant chain上、sync重算后tree clean且remote仍为parent
- **THEN** runner MUST复用已有commit并从push阶段继续
- **AND** MUST NOT重复commit、amend或重新stage无关内容

#### Scenario: Remote已经包含successor commit
- **WHEN** 本地successor commit满足当前run/plan且远端target回读已经等于该commit
- **THEN** commit与push阶段 MUST报告幂等passed并继续适用安装与finalize
- **AND** MUST NOT再次push或创建第二个successor commit

#### Scenario: 多个已完成Finish等待激活
- **WHEN** 当前Result的frozen ref之后存在一个或多个已push的人工、IDE、其他Agent或Buildr提交，全部形成无mergefirst-parent chain，retained HEAD与精确remote/branch一致且tree clean
- **THEN** runner MUST选择当前HEAD作为activation base，并按当前Result的frozen Task Contribution paths重算和执行自身去重plan
- **AND** MUST NOT要求这些commit携带`Buildr-Task`或closeout trailer，也不得为其补Task、空提交或伪造trailer
- **AND** 若sync产生delta，新successor MUST直接以该activation base为parent；后续Result MUST能把它作为可证明published descendant继续顺序收敛

#### Scenario: Buildr-owned descendant无需sync commit
- **WHEN** runner在可证明published descendant上执行当前Result且sync不适用或重算后没有delta
- **THEN** runner MUST不创建空successor commit，并继续适用安装、development entry identity与finalize
- **AND** MUST在结果中保留frozen ref、实际activation base与descendant commit evidence

#### Scenario: Successor tree 改变不复用旧研发证据
- **WHEN** actual activation base晚于Finish frozen ref且successor tree可能改变了任务内容
- **THEN** runner MUST只报告其在actual activation base执行的activation、development entry与Doctor事实
- **AND** MUST NOT把Finish frozen ref的Verification、Completion Review或Candidate宣称为successor的研发证据，也不得创建第二套adoption lifecycle

#### Scenario: 恢复身份无法证明
- **WHEN** descendant含merge、HEAD不是baseRef的ancestor后继、working tree含无法归属内容、local含未push descendant、local与remote不一致、remote再次漂移，或current run successor的run/plan trailer不匹配
- **THEN** runner MUST在sync、安装与finalize副作用前blocked并返回实际identity与唯一恢复入口
- **AND** MUST NOT stash、reset、rebase、创建merge、force push、扩大owned scope或接受任意未发布HEAD

### Requirement: Task Finish 调用必须使用有界长等待至终态
Task Finish Skill MUST在启动canonical `buildr task finish run`后，使用宿主支持的有界长等待读取同一进程/session，直到进程完成、失败、需要输入或等待窗口到期。等待窗口 MUST只控制Agent何时恢复控制，不得作为Finish业务timeout或固定完成时限；返回仍为running时 MAY继续长等待同一session，但 MUST NOT启动第二个Finish或对普通输出进行高频轮询。

#### Scenario: Finish超过首次yield窗口
- **WHEN** canonical Finish在首次终端yield窗口结束时仍在运行
- **THEN** Agent MUST保留同一session并进行一次有界长等待
- **AND** MUST NOT把yield解释为失败或重复执行Finish

#### Scenario: 长等待后仍未终止
- **WHEN**后续长等待达到宿主上限且进程仍为running
- **THEN** Agent MAY继续等待同一session并报告当前仍在运行
- **AND**调用次数 MUST由真实等待边界决定，不得承诺固定两次或写死45/60秒产品时限

#### Scenario: 进程需要输入或已结束
- **WHEN**同一session返回input-required、completed或failed
- **THEN** Agent MUST停止无条件等待并分别处理输入边界或消费最终结果
- **AND** MUST NOT在终态后继续poll

### Requirement: Runner 必须为并存 Finish carrier 生成 owner-ordered 恢复计划
Buildr 自举 Workspace 的 bundled runner MUST在任何activation副作用前，只读枚举固定Finish carrier根的直接子项，并通过现有Product `task finish inspect`入口核对每个候选的owning run。目录名 MUST只作为inspect候选；runner MUST以Finish Result证明run、canonical Workspace、真实非symlink carrier路径、carrier identity、状态与适用resume identity。可证明的foreign carrier MUST作为隔离共存observation返回，并作为精确untracked ignored root参与retained cleanliness；它们的owner cleanup或occupancy release建议 MAY按`taskId + runId`稳定排序，但 MUST不成为当前activation predecessor。Runner MUST不读取其业务内容、删除、修改、替owner恢复资源，也 MUST不写入新的Product Application、Receipt、SQLite row、队列或聚合store。只有任一entry ownership/path/identity不可证明时，当前invocation才 MUST保持blocked且activation effects为空。

#### Scenario: 可证明 cleanup_pending carrier 与当前 activation 共存
- **WHEN** 当前run之外存在一个或多个真实foreign目录，Product Result证明其Workspace/path/carrier identity与matching cleanup resume全部一致
- **THEN** runner MUST把它们记录为proven foreign observations并可附带owner `resume-owner-cleanup`建议
- **AND** 当前activation MUST继续竞争target lease，不得等待这些目录消失，也不得替owner执行cleanup

#### Scenario: 可恢复 predecessor cleanup 阻塞当前 activation
- **WHEN** 当前doctor-blocked run之外存在一个或多个可证明为`cleanup_pending`的foreign carrier
- **THEN** runner MUST将原先的predecessor表达改为非阻塞owner cleanup建议
- **AND** 当前activation MUST继续竞争target lease，不得生成等待全部predecessor消失的ordered recovery flow

#### Scenario: predecessor 已由原 owner 清理
- **WHEN** 原owner已经清理先前观察到的foreign carrier，当前inventory不再包含该目录
- **THEN** runner MUST按当前事实正常执行，不得要求或生成`--retry-after-foreign-clear`特殊模式
- **AND** MUST不保存历史recovery plan、改变run identity或形成自动重跑循环

#### Scenario: 自动重试基于最新远端 dev
- **WHEN** 任意适用invocation发现clean retained target branch落后于最新远端target ref，且后继链可证明并可fast-forward
- **THEN** runner MUST在target lease内于activation副作用前fetch、fast-forward和重新验证provenance
- **AND** 该能力 MUST适用于普通closeout而非仅foreign carrier清除后的重试

#### Scenario: 可证明 active doctor-blocked carrier 与当前 activation 共存
- **WHEN** foreign Result为active或doctor-blocked且其owner、Workspace、真实路径、carrier identity与resume关联可证明
- **THEN** runner MUST把该目录作为isolated coexisting observation和精确ignored untracked root
- **AND** 只有foreign owner真实持有相同target lease时当前runner才等待，不得因目录或状态本身blocked

#### Scenario: foreign carrier 状态不支持确定性 cleanup
- **WHEN** foreign Result为doctor-blocked、prepare/deliver blocked、terminal残留或其他不能生成确定性cleanup命令的状态，但owner/path/carrier identity仍可证明
- **THEN** inventory MUST展示原owner状态并将该目录视为isolated coexisting observation
- **AND** MUST不猜测跨owner恢复动作，也不得仅因状态不能自动cleanup而阻塞当前activation

#### Scenario: foreign carrier ownership或identity不可证明
- **WHEN** carrier条目是symlink、越出固定根、realpath重复，Product inspect失败，或Result的schema、run、Workspace、carrier path、carrier identity、适用resume identity任一缺失或不匹配
- **THEN** inventory MUST把该条目标记为`unprovable`并返回精确diagnostic
- **AND** runner MUST不生成owner command、不把该路径加入ignored roots，并在target lease、Git、sync、安装、Doctor、Finish resume与carrier删除零副作用状态停止

#### Scenario: proven carrier 下存在 tracked 或 staged 差异
- **WHEN** foreign carrier目录本身可证明，但retained Git index或tracked tree包含该路径差异
- **THEN** runner MUST继续以workspace dirty阻塞
- **AND** ignored root MUST只适用于精确untracked路径，不得隐藏tracked/staged内容

#### Scenario: 没有 foreign carrier
- **WHEN** 固定carrier根不存在，或只包含当前run精确拥有且已验证的carrier
- **THEN** multi-run preflight MUST返回无foreign observations且不得改变single-run plan、lease、阶段或effects语义

### Requirement: foreign-clear 自举重试必须有界承接同 run target-race
`--retry-after-foreign-clear` MUST不再作为target-race恢复的前提或独立模式。既有调用若仍携带该参数，runner MAY为兼容接受但 MUST按普通invocation执行：proven foreign carrier不形成predecessor，latest target与same-run target-race一律在activation lease内、sync/安装/重启之前按通用有界流程收敛。新runner result与owner建议 MUST不再生成该参数。

#### Scenario: target-race 可机械恢复并完成
- **WHEN** 普通或legacy foreign-clear invocation在activation前发现latest target前进，第一次same-run resume返回matching target-race且第二次可机械收敛
- **THEN** runner MUST按通用early convergence采用第二次Product Result并继续
- **AND** MUST不复制carrier reset、Git apply、containment或Task Finish状态机

#### Scenario: 最新 baseline 需要 Agent 适配
- **WHEN** 通用有界resume返回matching Delivery Adaptation required、carrier与resume token
- **THEN** runner MUST返回专用blocked diagnostic和完整`deliveryAdaptation` guidance
- **AND** 除必要latest-target fast-forward外，sync、commit/push、安装、重启、入口验证与Doctor effects MUST为空，Agent只能由同一Finish owner继续

#### Scenario: target-race 恢复不得形成循环
- **WHEN** 第二次Product resume再次返回target-race、其他blocked/failed或identity无法精确证明
- **THEN** runner MUST停止并报告实际Result
- **AND** MUST NOT新增第三次resume、runner自动重跑、持久retry counter、队列或聚合store

### Requirement: 已放弃且未交付的 foreign carrier 必须给出 occupancy 释放命令
当 foreign Finish Result 可证明其 Task 为 `abandoned`、该 run 从未成功交付、carrier 路径/identity/Workspace 匹配，且目录真实存在时，自举 closeout inventory MUST把该条目标记为可由原Task Finish owner执行的occupancy释放建议，命令为既有`task finish run --task <task-id> --run <run-id> --release-occupancy`。建议 MUST按`taskId + runId`稳定排序；当前runner MUST NOT删除、恢复或代替owner释放该carrier，只可将其精确根作为untracked ignored root，且该proven isolated carrier MUST不阻塞当前activation竞争target lease。

#### Scenario: 放弃后的未交付占用挡住当前 closeout
- **WHEN** 当前run之外存在foreign carrier，inspect证明Task abandoned、delivery未成功、carrier identity匹配
- **THEN** inventory MUST包含该run的owner `--release-occupancy`建议
- **AND** 当前runner MUST继续target lease preflight，不得把owner释放作为activation predecessor

### Requirement: 其他非 cleanup_pending 外载体仍须人工审查
除可确定性给出cleanup或occupancy命令的子集外，foreign Result为doctor-blocked、prepare/deliver blocked、terminal残留或其他状态时，runner MUST展示可证明owner与状态供原owner后续审查；只要Workspace/path/carrier identity与适用resume关联可证明，该observation MUST仍归类为isolated coexisting且不得阻塞当前activation。identity不可证明时 MUST仍为`unprovable`并零副作用停止。

#### Scenario: 仍在交付中的 foreign doctor-blocked
- **WHEN** foreign Result为doctor-blocked且Task仍active，或该run已有成功交付refs，并且全部owner/path/identity可证明
- **THEN** inventory MUST展示原owner状态且 MUST NOT生成`--release-occupancy`命令
- **AND** 当前runner MUST只根据相同target lease真实占用决定等待或继续

#### Scenario: Terminal carrier 残留但 identity 可证明
- **WHEN** foreign terminal Result仍有真实carrier目录且Result完整证明owner/path/carrier identity
- **THEN** runner MUST保留只读observation并可提示原owner审查残留
- **AND** MUST不替owner删除，也不得仅因残留目录阻塞当前activation

### Requirement: Self-bootstrap activation 必须复用 Task Finish target lease
Buildr 自举 Workspace 的bundled runner MUST在任何retained target fast-forward、sync、successor commit/push、Development Local App安装或重启、开发入口验证、最终Doctor或same-run Finish resume副作用前，以canonical Workspace、Task/run和稳定self-bootstrap投影中的Workspace repository `leaseTargetIdentity`通过retained Product内部driver获取同一Task Finish target lease。Runner MUST原样使用冻结exact identity，不得由`remote + targetBranch`或本机路径重新计算。matching retained Doctor blocked current row与matching terminal complete row MUST都可作为self-bootstrap owner；terminal row只临时持有lease普通列，不得改变terminal Result、Task状态或重新打开Finish。

为迁移已存在的run，旧bundled runner仍以`remote:targetBranch`请求时，retained Product MAY仅在matching run的冻结repository set中恰有一个applicable repository命中该逻辑target时解析为其exact identity。零匹配、多匹配、Workspace/Task/run不匹配或错误exact identity MUST在activation副作用前fail closed；新runner MUST不主动使用该兼容路径。

Runner MUST在每个潜在副作用阶段前刷新有界activation lease，并在全部返回路径按token fencing释放。same-run Product Finish resume可能自行释放或在terminal finalize清除lease；runner MUST在后续activation前重新获取/刷新，并把最终重复release视为幂等。另一个owner占用相同exact target时，runner MUST以空activation effects返回可重试waiting diagnostic；不同repository identity不得互相阻塞。过期terminal activation lease MUST可由后续owner安全接管，Doctor MUST继续报告未过期/过期lease事实。

#### Scenario: Complete Result 取得 activation lease
- **WHEN** terminal complete Finish Result命中self-bootstrap动作且相同exact target没有current owner
- **THEN** runner MUST使用投影的Workspace repository `leaseTargetIdentity`让matching terminal row持有有界target lease
- **AND** activation结束后 MUST token-fenced release，且terminal Result与Task状态保持不变

#### Scenario: Retained Doctor blocked Result 复用同 run lease
- **WHEN** doctor-blocked Finish Result进入runner且相同run仍是matching current row
- **THEN** runner MUST以投影的exact repository identity获取或刷新同一target lease，并在最终same-run Finish resume后幂等释放
- **AND** MUST不创建第二套lease表、runner receipt或外部lock authority

#### Scenario: 旧 runner 唯一兼容恢复 existing run
- **WHEN** 已存在current或terminal run由旧runner传入`remote:targetBranch`且matching repository恰好一个
- **THEN** retained Product MUST在同一owner边界把请求解析为该repository冻结的exact identity
- **AND** MUST允许该旧runner完成首次自举迁移而不重跑原Formal Finish

#### Scenario: 旧 runner identity 存在歧义
- **WHEN** 旧runner请求的逻辑target匹配零个或多个applicable repository，或Workspace、Task、run任一不匹配
- **THEN** driver与runner MUST在Git、sync、安装、Doctor和Finish resume零副作用状态停止
- **AND** MUST不猜测Workspace repository、不创建新run或把logical identity持久化为lease key

#### Scenario: 另一个 Task 正在交付同一 target
- **WHEN** foreign Finish deliver已持有相同exact repository target lease
- **THEN** self-bootstrap runner MUST在sync、Git、安装、重启、Doctor与Finish resume零副作用状态返回target waiting
- **AND** foreign Task与其他Task MUST仍可继续各自carrier preparation/verify/Delivery Adaptation

#### Scenario: Self-bootstrap 占用时另一个 Task 到达 deliver
- **WHEN** runner已持有activation lease，而另一个Task已独立准备好carrier并进入相同exact repository target的deliver
- **THEN** Product Finish MUST只让该deliver返回同run可恢复的target occupied诊断
- **AND** MUST不丢弃其carrier、不重建Candidate，也不得把整个Workspace Finish串行化

#### Scenario: 普通用户 Workspace
- **WHEN** Workspace未安装`buildr-self-bootstrap` Component
- **THEN** 普通Finish MUST继续只在既有deliver临界区使用短target lease
- **AND** MUST不获得terminal activation lease、self-bootstrap runner或新增post-Finish阶段

### Requirement: Runner 必须在 activation 副作用前有界收敛 latest target
每次适用self-bootstrap invocation MUST在持有target lease后读取并fetch latest target。只有retained checkout clean、Finish frozen ref是latest remote target的ancestor、后继无merge，且当前HEAD等于latest target或可fast-forward到该精确remote/branch并重新验证local/remote一致时，runner才 MUST把retained branch前进到latest ref并重算activation base；普通descendant的作者、工具与`Buildr-Task`或closeout trailer MUST NOT成为该行为的前置条件，且该行为 MUST不依赖foreign carrier清除后的特殊retry参数。

当retained Doctor blocked Result的latest target已越过Result绑定的delivery ref时，runner MUST在sync、安装或重启前先使用current exact token恢复一次同一Product Finish run。若返回matching `task-finish.target-race`，runner MUST最多再使用新token恢复一次，并在每次Product调用后重新获取/刷新target lease。Product返回matching Delivery Adaptation时，runner MUST返回carrier、resume与`deliveryAdaptation` guidance；除为读取latest target已完成的可证明fast-forward外，sync、commit/push、安装、重启、入口验证与Doctor effects MUST为空。返回新的doctor-blocked或complete Result时，runner MUST从该Result重新生成plan后继续。第二次仍target-race、其他blocked/failed或identity不匹配时 MUST停止，不得第三次resume或自动重跑runner。

#### Scenario: Latest target 已包含其他 Buildr 交付
- **WHEN** 当前Result的frozen ref之后存在已push、无merge的first-parent descendant，retained tree clean且可fast-forward到精确remote/branch
- **THEN** runner MUST在sync、安装和重启前fast-forward并以latest ref作为activation base
- **AND** MUST在lease内重算当前Result的frozen action plan，不得把foreign carrier目录顺序当作target顺序

#### Scenario: Doctor blocked run 可机械恢复 target-race
- **WHEN** latest target越过doctor-blocked Result的delivery ref，第一次same-run resume返回matching target-race，第二次在latest baseline可机械完成并返回doctor-blocked或complete
- **THEN** runner MUST采用新Result重建plan并继续适用activation
- **AND** Product Finish MUST仍独占carrier重建、equivalence、containment和delivery状态机

#### Scenario: Latest baseline 需要 Delivery Adaptation
- **WHEN** 第一次或第二次early Product resume返回matching Delivery Adaptation required
- **THEN** runner MUST在除必要latest-target fast-forward外的sync、commit/push、安装、重启、入口验证与最终Doctor零副作用状态返回Product carrier/token和完整blocked-only guidance
- **AND** Agent MUST只在该run-owned carrier内完成适配；runner不得自动解决语义冲突

#### Scenario: 有界恢复仍未收敛
- **WHEN** 第二次resume再次target-race，或Result的run、phase、code、carrier、token任一不匹配
- **THEN** runner MUST停止并报告实际Product Result
- **AND** MUST不调用第三次resume、不建立持久retry counter、队列或恢复store

### Requirement: Self-bootstrap remote readback 必须有限重试且不重复 push
Runner 的普通push成功后 MUST以固定小次数读取remote target。非零`ls-remote`结果 MAY在上限内重试并 MUST逐次保留operation evidence；成功回读但ref不一致 MUST立即按remote drift停止。持续不可读 MUST保留已经发生的commit/push effects并返回blocked，MUST NOT再次push、amend、reset或把整体结果报告为零effect。

#### Scenario: Push readback 暂态失败后成功
- **WHEN** successor push已成功，第一次remote readback非零且后续允许次数返回successor ref
- **THEN** runner MUST记录两次观察并继续安装/finalize
- **AND** MUST只发生一次push

#### Scenario: Push readback 持续失败
- **WHEN** successor push已成功但全部有限readback均非零
- **THEN** push阶段 MUST保持已发生remote effect并以readback blocked停止
- **AND** 重跑只能依据真实local/remote facts恢复，不得假定push未发生
