## MODIFIED Requirements

### Requirement: Task Finish Skill 必须收窄为授权与单命令入口
Buildr MUST提供实现`buildr.task-finish/v1`的Task Finish Skill。Skill MUST解析用户交付意图、Task ID与execution context，优先启动canonical `buildr task finish run --task <task-id>`并消费产品返回的入口聚合结果或五阶段Result；不得在调用产品前用自行链式Environment→handoff检查替代产品聚合分类回报。当产品返回入口聚合缺口时，Skill MUST按`development`/`environment`/`delivery`分类向用户说明，并在存在研发缺口时路由`task-development`。Receipt-bound Task 的 normal path MUST NOT收敛Change、运行Review/Verification、生成Candidate、领取checkpoint、构造recovery JSON或从普通PATH选择runtime。产品返回target-race resume token时，Skill MAY只用该精确token恢复同一run，不得把它解释为新的Development/Candidate流程。

#### Scenario: 用户要求收尾
- **WHEN** 用户在canonical Task Environment中明确要求收尾且Development handoff current
- **THEN** Agent MUST披露Task、Candidate/handoff、Task Contribution、Delivery Baseline、目标分支、远端、常规副作用与未授权动作
- **AND** 没有待人工语义决定时 MUST只启动canonical Task Finish executor并消费最终结果

#### Scenario: Development handoff缺失
- **WHEN** Task Development Application报告missing、blocked或stale，或产品入口聚合在`development`分类返回缺口
- **THEN** Task Finish Skill MUST停止并路由`task-development`
- **AND** MUST NOT从Change、Git、Review或Verification facts自行拼装finish-ready Candidate

#### Scenario: 产品一次返回多模块入口缺口
- **WHEN** `task finish run`返回`task_finish.entry_gaps`且`gaps`同时含环境与研发缺口
- **THEN** Skill MUST完整转述各模块缺口，不得只报告第一项
- **AND** MUST优先路由`task-development`处理研发缺口

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
