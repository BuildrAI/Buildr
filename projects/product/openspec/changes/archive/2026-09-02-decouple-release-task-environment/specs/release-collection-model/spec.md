## MODIFIED Requirements

### Requirement: 共享 Release Context 必须只组合current owner facts

Buildr MUST使用唯一closed builder组合release selection、release HEAD/tree、Product Candidate aggregate、冻结artifact、main/dev、Task correlation、matching Worktree evidence、Release Preparation、exact Node与publish workflow identity。Builder MUST NOT读取Task Environment ready、Plan、Receipt、controller或runtime投影。

#### Scenario: 构造完整dispatch context
- **WHEN** active release Task、matching Worktree、Release Preparation、Candidate、artifact、Git与Node事实全部current
- **THEN** Release MUST形成不含Environment字段的current context

#### Scenario: 专业事实缺失或漂移
- **WHEN** 任一必需owner fact缺失、stale、schema不受支持或与release source不一致
- **THEN** builder MUST保留可读取的其他owner projection并形成对应finding输入
- **AND** MUST NOT从Task状态、历史stdout、文件路径、caller assertion或旧Environment数据补造缺失成功

### Requirement: Release Git mutation 必须绑定matching Task Environment execution root

Release selection、reopen、main coverage/reconciliation与generation carrier准备等checkout-scoped Git mutation MUST只在matching active`release-<version>`Task的provider-owned Worktree中运行。Owner MUST核验canonical Workspace、Task、Worktree evidence、repo root、branch与HEAD；retained primary worktree、caller路径声明或旧Environment Receipt MUST NOT成为执行授权。

#### Scenario: matching release execution root
- **WHEN** active release Task、ready Worktree evidence、release branch与expected HEAD全部匹配
- **THEN** Release Git owner MAY执行对应Git动作

- **AND** result MUST返回Worktree binding identity与实际execution root disposition

#### Scenario: retained workspace被作为repo输入
- **WHEN** 调用方把canonical retained primary worktree作为release mutation repo
- **THEN** Release MUST在任何Git写入前拒绝

- **AND** retained branch、index与working tree MUST保持不变

#### Scenario: Environment binding漂移
- **WHEN** Task、Worktree evidence、branch或HEAD不再匹配closed binding
- **THEN** owner MUST返回current expected/actual identity与唯一Worktree恢复动作
- **AND** MUST NOT扫描其他worktree、切换执行root或回退到retained controller checkout执行Git mutation
