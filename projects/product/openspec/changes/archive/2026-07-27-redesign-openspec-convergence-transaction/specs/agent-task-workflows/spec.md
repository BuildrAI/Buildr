## MODIFIED Requirements

### Requirement: Task Finish 必须事务式推进 OpenSpec convergence
Task Finish MUST 把 OpenSpec deterministic convergence 作为单一产品事务调用。产品 MUST 在内部完成输入确定、冲突扫描、确定性规划、隔离严格验证、条件式原子应用、写后确认与 `archive --skip-specs`，并以 canonical before/expected 实际 digest 处理断点恢复。Task Finish 与 Agent MUST NOT 通过 baseline、pre-sync、post-sync 或 recovery stage 状态编排正常路径。

#### Scenario: delta 存在多个不兼容问题
- **WHEN** 多个 MODIFIED Requirement 遗漏、重命名、破坏既有 Scenario identity或与active Change冲突
- **THEN** convergence transaction MUST 在真实 canonical 写入前聚合报告全部可检测问题并返回 `blocked`
- **AND** MUST NOT 每次只返回第一个问题后要求重复内部命令

#### Scenario: canonical 在 pre-sync 后漂移
- **WHEN** plan或projected validation后canonical before digest、delta identity或OpenSpec executable identity改变
- **THEN** transaction MUST放弃旧执行资格并重新观察/规划或验证
- **AND** MUST NOT覆盖并发内容、刷新baseline或继续旧apply

#### Scenario: 应用后进程中断
- **WHEN** canonical已全部等于receipt expected digests但写后receipt或confirmation尚未完成
- **THEN** 下一次transaction MUST识别`applied-and-matched`并继续confirmation
- **AND** MUST NOT恢复canonical、重建baseline或重复apply

#### Scenario: post-sync 失败
- **WHEN** canonical已应用但写后严格验证或确认失败
- **THEN** transaction MUST 保留真实文件和回执事实并返回 `recovery-unprovable`
- **AND** MUST NOT 恢复 canonical、刷新 baseline 或伪造 post-sync 通过

#### Scenario: 状态无法证明
- **WHEN** canonical文件既不全部匹配before也不全部匹配expected
- **THEN** transaction MUST返回`recovery-unprovable`
- **AND** Task Finish与Agent MUST停止自动覆盖并保留人工检查现场

## ADDED Requirements

### Requirement: Agent只处理OpenSpec收敛语义结果
Buildr MUST 让 Agent 只处理 `blocked` 的语义冲突或 `recovery-unprovable` 的人工事实检查；确定性路径 MUST 完全由产品执行。Agent MUST NOT 被要求手工恢复 canonical spec、刷新 baseline、选择内部恢复 stage、拼装多条 guard 命令或解释多个 sidecar 不一致。

#### Scenario: 确定性事务通过
- **WHEN** `buildr openspec converge` 返回 `passed`
- **THEN** Agent MUST 将 canonical收敛与Change归档视为产品已安全完成
- **AND** 不得额外运行旧pre-sync/post-sync或手工sync命令

#### Scenario: 语义冲突阻塞
- **WHEN** converge返回`blocked`并列出冲突Change、Requirement或不完整delta
- **THEN** Agent MUST只修订语义authority或请求用户决定
- **AND** 修订后 MUST重新调用同一converge入口

#### Scenario: 状态不可证明
- **WHEN** converge返回`recovery-unprovable`
- **THEN** Agent MUST停止自动收尾并报告真实文件与receipt证据缺口
- **AND** MUST NOT通过删除sidecar、采用当前baseline或覆盖canonical绕过失败
