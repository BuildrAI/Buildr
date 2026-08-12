## ADDED Requirements

### Requirement: Task Finish 必须冻结有语义的交付提交信息
首次创建 Git-backed Task Finish run 时，Buildr MUST 要求 Agent 提供符合当前 Workspace、Project、Service 与 repository 约定的完整交付提交信息，并 MUST 在任何 Finish current、Delivery Carrier 或 target 副作用前完成规范化与校验。产品 MUST NOT 根据 Task ID、Change ID、diff、文件路径或内部 lifecycle facts自动推断 `type`、`scope` 或主题，也 MUST NOT继续为新run生成“交付 + Task ID”的占位主题。

规范化后的提交信息 MUST 包含非空 subject，MUST 将当前 Task ID 保存为 `Buildr-Task` trailer，并 MUST以稳定identity绑定到同一逻辑run。完整message只能由Task Finish owner作为恢复事实持有并写入实际Git commit；Task Record、Development Receipt、Environment Receipt与其他authority MUST NOT复制正文。公开Finish Result MUST只返回subject与message identity。

#### Scenario: 首次运行冻结 Agent 提供的语义提交信息
- **WHEN** Agent 对current handoff首次执行`buildr task finish run`并提供符合仓库约定的subject与可选body
- **THEN** Buildr MUST规范化message、确定性加入当前Task的`Buildr-Task` trailer并在创建任何run或carrier副作用前冻结其identity
- **AND** Delivery Carrier commit的完整message MUST与冻结message一致

#### Scenario: 新运行缺少语义提交信息
- **WHEN** Agent首次启动Git-backed Finish run但没有提供message、提供空subject或subject精确使用“交付 + 当前Task ID”占位格式
- **THEN** Buildr MUST在Finish current、execution record、Delivery Carrier、target和cleanup零副作用状态返回blocked
- **AND**唯一next action MUST要求Agent根据最终内容提供符合当前repository约定的提交信息

#### Scenario: Task ID 只作为追踪 trailer
- **WHEN** Agent提供`fix(task-finish): 保留语义化交付提交信息`作为subject
- **THEN** 实际Delivery Carrier commit MUST保持该subject并包含`Buildr-Task: <task-id>` trailer
- **AND** 产品 MUST NOT把Task ID、Change ID或“交付”操作词替换为subject

#### Scenario: 公开结果不复制正文
- **WHEN** Finish run已冻结包含subject与body的完整message
- **THEN** Task Finish current run MAY保存恢复所需的完整规范化message
- **AND**公开Result与Execution Record MUST只投影subject和message identity，不得复制完整body或建立第二writer

### Requirement: Task Finish 恢复必须复用同一提交信息
Task Finish MUST把规范化交付提交信息作为run-owned immutable恢复事实。`prepare`重试、target-race、Delivery Adaptation与`--run/--resume`恢复 MUST复用同一message identity，不得要求Agent重新生成、不得接受调用方覆盖，也不得因Delivery Baseline变化重新推断message。

已有current run缺少新字段时，兼容reader MAY只为该既有run恢复其已经持久化或已经形成的legacy carrier message；新run MUST NOT使用legacy fallback。任何Agent-reviewed Delivery Adaptation形成的最终carrier HEAD MUST保留冻结message，否则恢复 MUST blocked且不得deliver。

#### Scenario: blocked run 使用冻结信息恢复
- **WHEN** run已在prepare、target-race或cleanup阶段blocked并持有product-generated resume token
- **THEN** Agent使用`--run <id> --resume <token>`恢复时 MUST不重新提交message且产品 MUST复用原identity
- **AND**恢复不得改变carrier commit subject、body或`Buildr-Task` trailer

#### Scenario: 恢复时尝试覆盖提交信息
- **WHEN** 调用方对已有run同时提供新的提交信息
- **THEN** Buildr MUST拒绝该覆盖或明确忽略非适用输入且保持原run identity
- **AND**不得修改已存在的carrier、target或Finish current facts

#### Scenario: Delivery Adaptation 改变 carrier message
- **WHEN** Agent在run-owned carrier完成语义适配但最终HEAD message不再匹配冻结message identity
- **THEN** Task Finish MUST保持blocked并指出carrier message不一致
- **AND**不得deliver、重写原Task worktree或自动amend Agent的适配commit

#### Scenario: 升级前已有 run 继续恢复
- **WHEN** Workspace升级时已经存在缺少`deliveryCommit`字段的blocked或cleanup-pending run
- **THEN** Buildr MAY按该run已有carrier或legacy恢复事实继续完成同一run
- **AND**后续首次创建的新run MUST仍要求Agent提供语义message，不得长期回退占位模板
