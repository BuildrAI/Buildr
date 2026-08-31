## MODIFIED Requirements

### Requirement: Task Finish 与 Task Record complete 必须保持不同用户语义
本条旧交接和交付证明要求仅约束显式使用旧收尾执行器的路径。默认直接收尾 MUST采用本次新增的独立任务完成与内容保全要求，不得补造旧运行或交接。

Buildr MUST继续以`task-finish`解释“收尾、交付、合并、推送、retained检查与清理”，并以`task-manager`的complete operation表达Task Record terminal transition。`task-finish` Skill、`buildr.task-finish/v1` capability和`buildr task finish run|inspect`名称 MUST保留；Skill MUST只消费Task Finish Application Result，不得直接访问SQLite、SQL、migration、lease或transient files。

#### Scenario: 用户要求收尾有交付内容的 Task
- **WHEN** current Development handoff存在且用户要求提交、合并、推送、清理或完整收尾
- **THEN** Agent MUST路由`task-finish`并启动canonical五阶段执行器
- **AND** MUST NOT以`task complete`替代delivery、remote readback、Doctor或Environment cleanup

#### Scenario: Finish 成功结束 Task
- **WHEN** 产品执行器完成delivery、cleanup与SQLite terminal transaction
- **THEN** Agent MUST报告Task Finish complete及其compact delivery evidence
- **AND** Task Record completed MUST作为同一产品结果的终态事实，不得由Agent额外重跑complete

#### Scenario: 无变更 Task 直接完成
- **WHEN** Task Record Application已证明`noChange`且不存在需要交付的Content Target
- **THEN** `task-manager` MAY直接执行complete并记录no-change result
- **AND** MUST NOT伪造Task Finish run、completion、commit、push或cleanup evidence

#### Scenario: Agent 检查 Finish 状态
- **WHEN** Skill或Agent需要查看current/terminal Finish状态
- **THEN** MUST调用`buildr task finish inspect --task <task-id>`或绑定Application能力
- **AND** MUST NOT扫描`.buildr/task-finish`、查询SQLite或自行删除transient目录


### Requirement: Task Finish workflow 必须把产品缺陷退回研发
本条仅约束显式采用旧收尾运行（Finish Run）的专用执行路径；默认技能收尾与直接交付后的自举 MUST NOT依赖该路径或补造其证据。

Task Finish workflow MUST把current Development handoff作为前置条件。只有Task Development Application报告原Task source、Task Context、verification policy、gate或handoff真实stale，或者Task Contribution source identity无法由原Task source复算时，当前Finish run才 MUST终止并回到Task Development。Delivery Baseline前进、Git机械应用冲突、Delivery Adaptation、target-race、retained activation或cleanup暂态阻塞 MUST NOT单独使Candidate/generation/Verification/Completion Review/decision/handoff失效；它们 MUST在run-owned Delivery Carrier与产品生成exact resume token边界内处理。Skill MUST NOT把修复原Task内容、重新Formal Verification、Completion Review或Candidate generation描述为Finish恢复步骤。

#### Scenario: 最终保证发现产品缺陷
- **WHEN** Task Development Application报告current handoff、source、context、policy或gate真实stale，且Task Finish result返回`failureClass: upstream-candidate-defect`或`nextWorkflow: task-development`
- **THEN** Agent MUST明确说明不再current的Development applicability fact
- **AND** MUST结束当前Finish run并回到Development重新建立必要的Content Target/gates/Candidate/handoff

#### Scenario: Git conflict进入Delivery Adaptation
- **WHEN** 原Task source与Development handoff仍current，但Task Contribution不能机械应用到最新Delivery Baseline
- **THEN** Agent MUST只在匹配run-owned Delivery Carrier处理语义兼容，并以产品生成的current exact token恢复同一run
- **AND** MUST NOT修改或rebase原Task worktree、重启Development、生成Candidate或执行Formal Verification/Completion Review

#### Scenario: 只观察到路径不重叠
- **WHEN** Agent或产品只知道目标分支与任务修改路径没有重叠
- **THEN** Skill MUST NOT据此声称语义安全或绕过Project verification policy
- **AND** 只能继续消费产品返回的Git/identity equivalence facts与已有Development handoff决定

#### Scenario: 用户要求在收尾中顺手修复
- **WHEN** Finish发现原Task source或handoff真实stale，且用户没有明确授权继续研发修正
- **THEN** Agent MUST结束当前Finish并请求或使用已有授权进入Development workflow
- **AND** MUST NOT在当前Finish run修改原Task内容、接受风险或重跑Formal Verification

### Requirement: 正式持久交付必须经过 Task Environment ready 门槛
本条仅约束显式采用旧收尾运行（Finish Run）的专用执行路径；默认技能收尾与直接交付后的自举 MUST NOT依赖该路径或补造其证据。

Buildr task triage、OpenSpec contribution与正式执行入口 MUST把Task Environment ready门槛限制在实际消费Buildr-managed checkout、Preparation、runtime projection、Task-owned持久资源或正式环境证据的动作。Agent在用户已授权且repository、ref、owned scope与副作用明确时 MAY直接修改、构建或运行有界测试；该路径 MUST不生成或冒充Environment、Development、Review、Verification、Candidate、Finish或cleanup事实。采用受管环境后，planning、实现、Content Target观察、formal Verification与Candidate准备 MUST只发生在Receipt允许根。

#### Scenario: Triage 选择 Change Flow
- **WHEN** Task Record已建立且即将创建首份预计进入受管实现的OpenSpec artifact
- **THEN** Agent MUST先通过Task Environment准备或恢复实际执行位置
- **AND** 只有ready后才 MUST在允许根创建Change artifacts

#### Scenario: 直接命中 OpenSpec propose
- **WHEN** 用户意图直接命中installed `openspec-propose`且任务预计形成Buildr-managed持久交付
- **THEN** contribution MUST在`openspec new change`前核对Task与ready Environment
- **AND** MUST通过`task-environment`而非直接调用Git provider

#### Scenario: Code-only 实现
- **WHEN** 正式Task不需要OpenSpec Change但选择由Buildr管理checkout、依赖、runtime或正式证据
- **THEN** Agent MUST取得matching ready Environment
- **AND** MUST NOT因没有Change而跳过执行根、依赖与资源边界

#### Scenario: Formal Task 中直接工作
- **WHEN** 用户授权Agent在明确现有repository中直接修改、构建或运行有界测试，且不请求Buildr-managed Environment或正式Result
- **THEN** task-triage MUST允许该动作按Git、文件ownership和实际副作用边界推进，并把Environment准备保留为recommended选项
- **AND** MUST NOT创建虚假Receipt、把直接测试写成Formal Verification或把未登记资源交给Environment cleanup

#### Scenario: 只有 lifecycle metadata 写入
- **WHEN** 已有Task的Environment、Development、Review、Verification、Finish Skill只在canonical Workspace维护自己的Receipt或Result且不触发新环境效果
- **THEN** workflow MUST NOT为metadata写入重新准备已清理环境
- **AND** MUST保持各专业writer的canonical metadata authority

#### Scenario: Stable Content Target交给Task Verification
- **WHEN** Environment中的内容修改、Change convergence、current knowledge与受管生成资产已达到stable target
- **THEN** Task Development MUST观察完整Content Target并明确verification policy
- **AND** Task Verification MUST只绑定该Content Target、declarations、execution与evidence，不得拥有Candidate、policy或proceed

#### Scenario: Candidate 交给 Task Verification
- **WHEN** 旧consumer尝试把Candidate identity直接交给Task Verification
- **THEN** P0.5 workflow MUST拒绝该顺序，并先由Development观察stable Content Target、记录policy并完成formal Verification
- **AND** Task Verification MUST NOT接收、生成或持久化Candidate identity

## ADDED Requirements

### Requirement: 收尾技能检查不得固化过程文案
技能检查 MUST只执行通用结构、资源完整性与能力绑定约束，不要求旧流程关键字、最低字数或最低行数。

#### Scenario: 合法短技能
- **WHEN** 收尾技能内容满足通用格式及真实能力契约，但没有旧交接文案且少于旧字数下限
- **THEN** 静态检查 MUST允许通过，不要求补回已退役流程或无意义文字。


### Requirement: 默认收尾必须由技能指导智能体完成目标
默认收尾 MUST由智能体（Agent）依据用户目标和真实现场组合原生 Git、系统工具和现有 Buildr 接口；技能（Skill）MUST不要求候选、交接、五阶段运行、完整环境或对账结果。专项能力只在实际适用时触发。

#### Scenario: 已有任务
- **WHEN** 目标实际达成且用户授权范围明确
- **THEN** 智能体 MUST复用 `task complete` 保存结果，分别说明交付、验证、激活和资源残留；不得为完成记录补造交接。

#### Scenario: 没有任务或非代码成果
- **WHEN** 当前工作没有匹配任务或没有 Git 变化
- **THEN** 智能体 MUST直接完成适用交付及善后，不创建临时任务、不制造提交。

#### Scenario: 多仓库部分成功
- **WHEN** 一个仓库已交付，另一个仓库受阻
- **THEN** 智能体 MUST保留已成立结果，只处理剩余仓库，不重复推送成功项。

#### Scenario: 内部缺口
- **WHEN** 内部记录缺失但真实结果可观察
- **THEN** 智能体 MUST继续其他安全工作；仅在越权、错误对象、数据丢失或完成误报风险处停止相关动作。

## REMOVED Requirements

### Requirement: Task Finish Skill 必须收窄为授权与单命令入口
**Reason**: 用户已批准由智能体组合工具完成目标，单命令和交接前置已退役。
**Migration**: 使用默认收尾技能；旧执行器只在显式需要时调用。

#### Scenario: 退役原前置要求
- **WHEN** 默认收尾采用本次确认的技能流程
- **THEN** 系统 MUST不要求本条退役流程，使用 Migration 中的替代方式。

### Requirement: Task Finish handoff 必须保持 Git 单项能力边界
**Reason**: 单项 Git 能力仍保留，但不再按 metadata-only 与正式运行分叉技能流程。
**Migration**: 默认技能依据现有绑定使用 Git；单项操作的授权与内容保全不变。

#### Scenario: 退役原前置要求
- **WHEN** 默认收尾采用本次确认的技能流程
- **THEN** 系统 MUST不要求本条退役流程，使用 Migration 中的替代方式。
