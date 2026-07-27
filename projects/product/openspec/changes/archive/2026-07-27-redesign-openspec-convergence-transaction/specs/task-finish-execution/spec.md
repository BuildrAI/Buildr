## MODIFIED Requirements

### Requirement: Task Finish必须消费产品持有的convergence orchestrator
Task Finish MUST 通过唯一 product-executable action 调用 `buildr openspec converge`，并且只消费 `passed`、`blocked` 或 `recovery-unprovable`、单一 receipt identity、effects、duration 与 command count。Task Finish MUST NOT 理解或持久化 rehearsal、baseline、pre-sync、plan、apply、post-sync、canonical restore 或 recovery stages。

#### Scenario: Safe convergence一次推进
- **WHEN** planner、projected validation、conditional apply、confirmation 与 `archive --skip-specs` 均可安全完成
- **THEN** Task Finish executor MUST 在同一 convergence attempt 内调用一次产品 action 并接收 `passed`
- **AND** checkpoint MUST 记录最终 receipt identity 与聚合执行摘要

#### Scenario: Planner要求语义处理
- **WHEN** orchestrator 返回 `blocked`
- **THEN** run MUST 保持 contract-convergence blocked并指向Agent/用户处理最小语义冲突
- **AND** resume MUST 重新调用同一 product action而不得要求Agent拼装内部命令

#### Scenario: 恢复状态无法证明
- **WHEN** orchestrator 返回 `recovery-unprovable`
- **THEN** run MUST 停止尚未执行的正式验证、archive集成与push
- **AND** checkpoint MUST 保留实际文件摘要和人工检查下一动作

## ADDED Requirements

### Requirement: Task Finish checkpoint必须使用轻量CLI bootstrap
Buildr MUST 为 `task finish inspect|advance|recover` 的 checkpoint 状态写入提供不加载 OpenSpec、Git、runtime 或其他产品 domain 的轻量 CLI bootstrap。该 bootstrap MUST 只加载 finish run store、atomic writer、lease ownership 和 compact result 所需模块。

#### Scenario: OpenSpec模块存在语法错误
- **WHEN** 完整 OpenSpec domain 因语法错误或 Git 冲突标记无法加载
- **THEN** Task Finish checkpoint 命令 MUST 仍能启动并把 contract-convergence记录为 blocked
- **AND** 命令 MUST 返回可恢复的 compact checkpoint而不是 bootstrap 崩溃

#### Scenario: blocked attempt持有lease
- **WHEN** 损坏 domain 导致当前 contract-convergence attempt无法继续且lease仍属于该attempt
- **THEN** 轻量 checkpoint MUST 原子终结 attempt并释放identity匹配的lease
- **AND** MUST NOT删除其他run或attempt持有的lease

#### Scenario: 轻量入口尝试扩大副作用
- **WHEN** 调用方要求轻量 bootstrap执行converge、Git、provider或canonical写入
- **THEN** bootstrap MUST拒绝该动作并保持产品 domain未加载
- **AND** 必须要求通过完整CLI入口执行实际产品动作
