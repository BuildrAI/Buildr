## ADDED Requirements

### Requirement: Agent 必须消费正式任务入口的同源引导
Buildr随包Task Skills MUST消费产品返回的同源输入发现与typed next，不得复制Plan request schema、把pre-admission数据伪装为recovery pointer或重复已current的Parent Acceptance。

#### Scenario: Verification preparation blocked
- **WHEN** `verification run` compact summary以`verification.preparation_blocked`退出且`recovery`为null
- **THEN** `task-verification` MUST按primary failure指引对同一 invocation追加`--detail full`读取`admission.recovery.planRequest`
- **AND** MUST把该Plan request原样交给Task Environment流程，不得启动新的Verification run或补造Execution Record

#### Scenario: Agent形成 Environment Plan input
- **WHEN** Agent需要调用`task environment plan record`
- **THEN** `task-environment` MUST优先消费该action的`--schema|--example`发现实际输入结构
- **AND** MUST不从Skill正文维护第二份schema或绕过Application运行态校验

#### Scenario: Parent Acceptance 已current
- **WHEN** Parent coordination返回current Acceptance且顶层`task next`给出Development后续动作
- **THEN** `task-development` MUST继续消费该typed next
- **AND** MUST不再次执行`accept-parent`或自行硬编码Finish动作
