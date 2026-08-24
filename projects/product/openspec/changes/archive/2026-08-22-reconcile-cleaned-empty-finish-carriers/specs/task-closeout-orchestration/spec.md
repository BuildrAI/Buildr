## MODIFIED Requirements

### Requirement: Runner 必须为并存 Finish carrier 生成 owner-ordered 恢复计划
Buildr 自举 Workspace 的 bundled runner MUST在任何activation副作用前，只读枚举固定Finish carrier根的直接子项，并通过现有Product `task finish inspect`入口核对每个候选的owning run。目录名 MUST只作为inspect候选；runner MUST以Finish Result证明run、canonical Workspace、真实非symlink carrier路径、carrier identity、状态与适用resume identity。可证明的foreign carrier MUST作为隔离共存observation返回，并作为精确untracked ignored root参与retained cleanliness；它们的owner cleanup或occupancy release建议 MAY按`taskId + runId`稳定排序，但 MUST不成为当前activation predecessor。Runner MUST不读取其业务内容、修改、替owner恢复资源，也 MUST不写入新的Product Application、Receipt、SQLite row、队列或聚合store。

唯一允许runner删除foreign run entry的兼容例外是：Product稳定Finish Result已明确把该run全部repository carrier声明为`availability: cleaned`且`root: null`，Workspace repository carrier与集合中的selector/identity/cleaned状态一致，entry是固定受管根下与run精确匹配的真实非symlink直接目录，realpath未越界且目录完全为空。Runner MUST把这种历史残留归类为`stale-empty-container`，使用非递归空目录删除在activation前收敛，并重新枚举inventory；MUST不执行owner resume、不修改owner Result/Task/Environment，也不得把该兼容扩展到任意其他managed metadata或用户目录。只有任一entry ownership/path/identity不可证明，或兼容删除失败时，当前invocation才 MUST保持blocked且activation effects为空。

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

#### Scenario: 已清理 Result 遗留精确空 run container
- **WHEN** foreign Product Result把全部repository carrier声明为`availability: cleaned`且`root: null`，Workspace carrier identity匹配，并且精确run entry是真实、非symlink、未越界且完全为空的目录
- **THEN** runner MUST将其记录为`stale-empty-container`，以非递归空目录删除收敛并重新枚举inventory
- **AND** 当前activation MUST继续，且runner MUST不执行owner resume或修改owner Product状态

#### Scenario: 已清理 Result 的 run container 非空或删除失败
- **WHEN** foreign Result声称carrier已清理，但精确run entry包含任意目录项，或空目录删除因race、权限或其他原因失败
- **THEN** inventory MUST把该条目标记为`unprovable`并返回精确diagnostic
- **AND** runner MUST在target lease、Git、sync、安装、Doctor、Finish resume与递归删除零副作用状态停止

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
