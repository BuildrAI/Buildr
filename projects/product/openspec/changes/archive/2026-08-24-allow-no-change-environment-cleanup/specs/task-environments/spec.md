## ADDED Requirements

### Requirement: Completed no-change Task 必须可受控清理 Environment
Task Environment MUST仅从current Task Record的`completed + noChange=true`终态派生no-change cleanup资格，并 MUST要求Git provider独立证明checkout干净且当前HEAD精确等于Environment evidence冻结的HEAD。Task Record声明 MUST NOT授权删除Environment建立后的新增提交或dirty内容；普通`completed + noChange=false` Task仍 MUST提供可独立复核的Delivery evidence。

#### Scenario: 无代码协调Task完成后清理
- **WHEN** current Task Record为`completed + noChange=true`，checkout保持干净且HEAD等于Environment provider evidence冻结的HEAD
- **THEN** Task Environment MUST允许provider清理Task worktree、任务分支与受控资源，不要求伪造Delivery或Finish evidence
- **AND** Environment Receipt MUST记录最终cleaned状态与实际cleanup effects

#### Scenario: no-change checkout 包含 dirty 内容
- **WHEN** current Task Record为`completed + noChange=true`但checkout存在staged、unstaged或untracked内容
- **THEN** Git provider MUST拒绝cleanup并保留checkout、任务分支与provider evidence

#### Scenario: no-change checkout HEAD 已漂移
- **WHEN** current Task Record为`completed + noChange=true`但checkout HEAD不等于Environment evidence冻结的HEAD
- **THEN** Git provider MUST以明确HEAD drift诊断拒绝cleanup并保留现场

#### Scenario: 普通completed Task缺少交付证明
- **WHEN** current Task Record为`completed + noChange=false`且没有可复核Delivery evidence
- **THEN** Task Environment MUST拒绝cleanup，不得把completed状态当作integrated proof
