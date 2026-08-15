## ADDED Requirements

### Requirement: Agent 必须有界自动重试已解除 foreign 阻断的同一自举收尾
Buildr self-bootstrap workflow MUST把已授权current closeout与跨owner cleanup区分为不同授权边界。foreign owner action MUST继续等待用户明确授权；当前runner若仅因可证明foreign carrier在零副作用处blocked，则该foreign集合由原owner清空后，Agent MUST可复用当前closeout授权自动重试同一run一次。Agent MUST NOT为此创建后台协调器、持久等待状态或递归重试。

#### Scenario: foreign owner 清理后继续当前收尾
- **WHEN** 前次runner diagnostic精确为`self-bootstrap-closeout.foreign-carriers-require-owner-recovery`、顶层`effects`为空、原owner已清除全部foreign carrier，且run、target、Environment retained Node与runner command均未改变
- **THEN** Agent MUST重新调用同一runner一次而无需询问current retry授权
- **AND** runner MUST重新读取最新远端`dev`并执行完整preflight，不得复用前次plan观察替代current事实

#### Scenario: current retry 不再满足安全条件
- **WHEN** foreign carrier再次出现、run或command identity改变、latest `dev`无法clean fast-forward或完整preflight blocked
- **THEN** Agent MUST停止自动推进，报告当前问题与runner恢复事实并等待新指令
- **AND** Agent MUST NOT自动执行merge commit、rebase、冲突解决、跨owner mutation或第二次自动重试
