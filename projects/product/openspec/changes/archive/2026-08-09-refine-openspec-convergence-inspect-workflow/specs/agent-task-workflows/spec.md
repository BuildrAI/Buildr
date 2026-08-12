## MODIFIED Requirements

### Requirement: Agent 只能处理收敛事务外的语义决定
Agent MUST 将 Buildr 的确定性收敛结果视为产品事实：`passed`直接继续Development后续阶段，`blocked`只处理最小语义冲突，`recovery-unprovable`只在当前Task执行位置仍保留恢复现场时使用OpenSpec Convergence Inspect或进行人工核对。Agent MUST NOT手工恢复Canonical Specs、刷新baseline、选择内部恢复stage、拼装旧门禁命令、把Inspect变成正常验收门禁，或在Formal Task Finish/Environment cleanup后追索Receipt。

#### Scenario: 产品报告状态无法证明
- **WHEN** `buildr openspec converge`返回`recovery-unprovable`且当前Task Environment尚未清理
- **THEN** Agent MAY调用`buildr openspec convergence inspect`读取逐文件事实，并停止其他正式文件写入
- **AND** MUST NOT删除Receipt、刷新baseline或从旧stage继续

#### Scenario: 产品报告确定性通过
- **WHEN** `buildr openspec converge`返回`passed`与`archived`
- **THEN** Agent MUST直接消费该结果继续current knowledge检查、Content Target、Verification与后续Task流程
- **AND** MUST NOT再次运行Convergence Inspect或要求Receipt进入Git交付

#### Scenario: Task Environment已经清理
- **WHEN** Formal Task Finish已经成功且Task Environment cleanup完成
- **THEN** Agent MUST使用Archived Change、Canonical Specs、Git交付事实和Formal Finish Result回答正常历史问题
- **AND** MUST NOT要求恢复Worktree、读取Receipt或把Receipt缺失报告为`recovery-unprovable`

#### Scenario: Inspect返回not-applicable
- **WHEN** Convergence Inspect报告事务尚未开始或Change已经终结
- **THEN** Agent MUST按reason code分别启动Converge或停止恢复检查
- **AND** MUST NOT把`not-applicable`解释为同步失败、归档失败或长期证据缺失
