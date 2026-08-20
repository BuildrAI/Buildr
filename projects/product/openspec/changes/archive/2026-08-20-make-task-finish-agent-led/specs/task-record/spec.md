## MODIFIED Requirements

### Requirement: Formal Finish 正常完成必须复用 Task Record Application
Task Record Application MUST提供仅供经过验证的Task交付收敛调用的内部终态动作。该动作 MUST保持Task Record Application为顶层状态唯一writer，在单个数据库事务中把active Task写为`completed`与`result.noChange=false`；MUST对既有`completed/noChange=false`返回零写入的幂等成功；MUST拒绝覆盖`completed/noChange=true`、`abandoned`或损坏记录。该动作 MAY由自动Formal Finish或独立delivery reconciliation调用，但 MUST NOT公开为允许调用方声明交付成功的公共setter，也 MUST NOT触发Git交付、Environment cleanup、Parent/Child状态传播或其他专业动作。

#### Scenario: Finish 通过唯一 Application 完成 active Task
- **WHEN** 全部applicable repositories的current Task Contribution已经由真实远端事实证明交付
- **THEN** Task delivery reconciler MUST通过Task Record Application原子写入`status: completed`、确定性summary与`noChange: false`
- **AND** result MUST返回当前record、recordDigest与精确mutation effects

#### Scenario: 等价终态零写入
- **WHEN** 自动Finish或delivery reconciliation提交一个已经`completed/noChange=false`的Task
- **THEN** Task Record Application MUST返回当前终态与零mutation effects
- **AND** MUST NOT改写summary、updatedAt或Parent/Child关系

#### Scenario: 冲突终态不可覆盖
- **WHEN** 交付收敛目标Task已经`completed/noChange=true`或`abandoned`
- **THEN** Task Record Application MUST返回类型化冲突且effects为空
- **AND** 原Task Record MUST保持不变

## ADDED Requirements

### Requirement: Task 交付终态不得被后续维护 attention 撤销
Task Record的`completed/noChange=false` MUST只表达已验证的任务交付结果。retained activation、Environment cleanup、Finish transient cleanup或diagnostics retention的pending/attention MUST由专业read model独立展示，MUST NOT把已完成Task退回active、blocked或未交付。

#### Scenario: completed Task仍有cleanup attention
- **WHEN** Task已完成远端交付而Task Environment尚未安全清理
- **THEN** Task Record MUST保持completed，Task详情 MUST展示独立cleanup attention
- **AND** Agent MUST能继续处理清理且用户可以查看结果和进行任务复盘
