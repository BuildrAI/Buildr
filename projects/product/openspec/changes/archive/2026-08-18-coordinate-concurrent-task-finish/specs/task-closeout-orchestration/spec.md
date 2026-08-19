## ADDED Requirements

### Requirement: Self-bootstrap activation 必须复用 Task Finish target lease
Buildr 自举 Workspace 的 bundled runner MUST在任何 retained target fast-forward、sync、successor commit/push、Development Local App安装或重启、开发入口验证、最终Doctor或same-run Finish resume副作用前，以canonical Workspace、Task/run和`remote + targetBranch`通过retained Product内部driver获取同一Task Finish target lease。matching retained Doctor blocked current row与matching terminal complete row MUST都可作为self-bootstrap owner；terminal row只临时持有lease普通列，不得改变terminal Result、Task状态或重新打开Finish。

Runner MUST在每个潜在副作用阶段前刷新有界activation lease，并在全部返回路径按token fencing释放。same-run Product Finish resume可能自行释放或在terminal finalize清除lease；runner MUST在后续activation前重新获取/刷新，并把最终重复release视为幂等。另一个owner占用相同target时，runner MUST以空activation effects返回可重试waiting diagnostic；不同target不得互相阻塞。过期terminal activation lease MUST可由后续owner安全接管，Doctor MUST继续报告未过期/过期lease事实。

#### Scenario: Complete Result 取得 activation lease
- **WHEN** terminal complete Finish Result命中self-bootstrap动作且相同target没有current owner
- **THEN** runner MUST在activation副作用前让matching terminal row持有有界target lease
- **AND** activation结束后 MUST token-fenced release，且terminal Result与Task状态保持不变

#### Scenario: Retained Doctor blocked Result 复用同 run lease
- **WHEN** doctor-blocked Finish Result进入runner且相同run仍是matching current row
- **THEN** runner MUST以该run获取/刷新同一target lease，并在最终same-run Finish resume后幂等释放
- **AND** MUST不创建第二套lease表、runner receipt或外部lock authority

#### Scenario: 另一个 Task 正在交付同一 target
- **WHEN** foreign Finish deliver已持有相同`remote + targetBranch` lease
- **THEN** self-bootstrap runner MUST在sync、Git、安装、重启、Doctor与Finish resume零副作用状态返回target waiting
- **AND** foreign Task与其他Task MUST仍可继续各自carrier preparation/verify/Delivery Adaptation

#### Scenario: Self-bootstrap 占用时另一个 Task 到达 deliver
- **WHEN** runner已持有activation lease，而另一个Task已独立准备好carrier并进入相同target的deliver
- **THEN** Product Finish MUST只让该deliver返回同run可恢复的target occupied诊断
- **AND** MUST不丢弃其carrier、不重建Candidate，也不得把整个Workspace Finish串行化

#### Scenario: 普通用户 Workspace
- **WHEN** Workspace未安装`buildr-self-bootstrap` Component
- **THEN** 普通Finish MUST继续只在既有deliver临界区使用短target lease
- **AND** MUST不获得terminal activation lease、self-bootstrap runner或新增post-Finish阶段

### Requirement: Runner 必须在 activation 副作用前有界收敛 latest target
每次适用self-bootstrap invocation MUST在持有target lease后读取并fetch latest target。只有retained checkout clean、当前HEAD可fast-forward、Finish frozen ref为ancestor、后继无merge且每个commit具有Buildr Task或self-bootstrap provenance时，runner才 MUST把retained branch前进到latest ref并重算activation base；该行为 MUST不依赖foreign carrier清除后的特殊retry参数。

当retained Doctor blocked Result的latest target已越过Result绑定的delivery ref时，runner MUST在sync、安装或重启前先使用current exact token恢复一次同一Product Finish run。若返回matching `task-finish.target-race`，runner MUST最多再使用新token恢复一次，并在每次Product调用后重新获取/刷新target lease。Product返回matching Delivery Adaptation时，runner MUST返回carrier、resume与`deliveryAdaptation` guidance；除为读取latest target已完成的可证明fast-forward外，sync、commit/push、安装、重启、入口验证与Doctor effects MUST为空。返回新的doctor-blocked或complete Result时，runner MUST从该Result重新生成plan后继续。第二次仍target-race、其他blocked/failed或identity不匹配时 MUST停止，不得第三次resume或自动重跑runner。

#### Scenario: Latest target 已包含其他 Buildr 交付
- **WHEN** 当前Result的frozen ref之后存在已push的Buildr-owned first-parent descendant，retained tree clean且可fast-forward
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

## MODIFIED Requirements

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
