## MODIFIED Requirements

### Requirement: Task Finish Skill 必须收窄为授权与单命令入口
Buildr MUST提供实现`buildr.task-finish/v1`的Task Finish Skill。Skill MUST解析用户交付意图、Task ID与execution context，先通过selected `buildr.task-development@1`确认current handoff，再披露隔离Delivery Carrier、Task Contribution/Delivery Baseline identity、普通integration/push、retained与cleanup授权及明确排除项。Receipt-bound Task MUST只启动canonical `buildr task finish run --task <task-id>`；normal path MUST NOT收敛Change、运行Review/Verification、生成Candidate、领取checkpoint、构造recovery JSON或从普通PATH选择runtime。产品返回target-race resume token时，Skill MAY只用该精确token恢复同一run，不得把它解释为新的Development/Candidate流程。

#### Scenario: 用户要求收尾
- **WHEN** 用户在canonical Task Environment中明确要求收尾且Development handoff current
- **THEN** Agent MUST披露Task、Candidate/handoff、Task Contribution、Delivery Baseline、目标分支、远端、常规副作用与未授权动作
- **AND** 没有待人工语义决定时 MUST只启动canonical Task Finish executor并消费最终结果

#### Scenario: Development handoff缺失
- **WHEN** Task Development Application报告missing、blocked或stale
- **THEN** Task Finish Skill MUST停止并路由`task-development`
- **AND** MUST NOT从Change、Git、Review或Verification facts自行拼装finish-ready Candidate

#### Scenario: 目标分支前进但贡献等价
- **WHEN** 产品证明最新Delivery Baseline上的Task Contribution无冲突且identity等价，并完成同一Candidate的delivery/cleanup
- **THEN** Skill MUST报告复用了原Candidate、Verification、Completion Review与handoff，generation未增加且formal Verification执行数为0
- **AND** MUST不把机械等价表述为语义安全或业务验收

#### Scenario: target-race精确恢复
- **WHEN** 产品在deliver前观察到target再次前进并返回current resume token
- **THEN** Skill MUST只以该token恢复同一run，让产品重做隔离carrier的`prepare → verify → deliver → cleanup`
- **AND** MUST不手写token、重启Development、生成Candidate或执行Verification/Completion Review

#### Scenario: Retained metadata-only 候选正式 handoff
- **WHEN** 用户在retained canonical Workspace对已完成且已验证的metadata-only任务要求收尾，且任务文件、目标分支和无关改动可精确区分
- **THEN** Task Finish Skill MAY将产品执行器标记不适用并披露精确任务文件/排除项/commit/push影响
- **AND** MUST只把明确Git Operation交给selected `buildr.git-operations/v1` provider

#### Scenario: Retained handoff 无法证明文件隔离
- **WHEN** metadata-only候选的任务文件范围、验证identity、目标ref或Git provider readiness无法证明
- **THEN** Task Finish Skill MUST blocked并报告缺失输入/provider reason
- **AND** MUST NOT使用`git add -A`、stash、回滚、虚假Change或手写Git回退绕过边界

#### Scenario: 产品返回完整结果
- **WHEN** current result为complete
- **THEN** Skill MUST直接报告handoff/contribution/baseline/carrier/delivery/retained/cleanup与效率证据
- **AND** MUST NOT为确认已完成动作再次调用inspect或同等验证命令

### Requirement: Task Finish workflow 必须把产品缺陷退回研发
Task Finish workflow MUST把current Development handoff作为前置条件。内容/任务贡献漂移、Git冲突、贡献identity不等价、产品缺陷、规范语义错误、审查遗漏、测试失败或需要语义判断的目标变化 MUST退出收尾并回到Task Development；只有产品能确定性证明Task Contribution在最新Delivery Baseline上等价时，target advance才 MAY在Finish内通过隔离carrier复用原Candidate。Skill MUST NOT把修复、重新Verification、Review或Candidate generation描述为Finish恢复步骤。

#### Scenario: 最终保证发现产品缺陷
- **WHEN** Task Finish result返回`failureClass: upstream-candidate-defect`或`nextWorkflow: task-development`
- **THEN** Agent MUST明确说明current handoff、Task Contribution equivalence或carrier不再finish-ready
- **AND** MUST结束当前Finish run并回到Development重新建立必要的Content Target/gates/Candidate/handoff

#### Scenario: 用户要求在收尾中顺手修复
- **WHEN** 冲突、贡献漂移、语义判断或产品缺陷已被Task Finish发现，而用户没有明确要求继续研发修正
- **THEN** Agent MUST NOT在当前Finish run编辑实现、解决冲突或重跑formal Verification
- **AND** MUST请求或使用已有授权进入Development workflow

#### Scenario: 只观察到路径不重叠
- **WHEN** Agent或产品只知道目标分支与任务修改路径没有重叠
- **THEN** Skill MUST NOT据此声称语义安全或绕过Project verification policy
- **AND** 只能继续消费产品返回的Git/identity equivalence facts与已有Development handoff决定
