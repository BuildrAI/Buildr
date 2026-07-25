## ADDED Requirements

### Requirement: Task Finish 在相关资产变更中先完成收尾就绪检查
Buildr `task-finish` MUST 在将当前实现 tree 交给 selected task-verification provider 之前，对触及受管 Component、Skill、Command、lockfile、外部命令声明或 OpenSpec 升级信号的任务执行 closeout readiness checkpoint。checkpoint MUST 报告触发信号、实际检查、跳过理由和阻塞的下一步，且 MUST NOT 把该 workflow check 计作 task-verification provider 的 `execute` 或 Candidate executor invocation。

#### Scenario: 相关资产变更具有可收敛的本地依赖
- **WHEN** checkpoint 发现当前 Project 已由 lockfile 声明的 checkout-local dependency 与声明版本不一致，且 Project 既有环境准备入口允许在 canonical task environment 中执行依赖安装
- **THEN** Task Finish MUST 在 Candidate 前通过该 Project 的既有入口收敛本地依赖并重新核对版本
- **AND** 任何依赖安装失败 MUST 阻止 Candidate、archive、integrate、push 和 cleanup

#### Scenario: 外部 CLI 版本不匹配
- **WHEN** checkpoint 发现受管资产声明的外部 CLI 版本与当前可用 command 不匹配
- **THEN** Task Finish MUST 停止后续收尾并报告声明版本、实际版本和可执行修复路径
- **AND** “收尾” MUST NOT 隐式授权安装、升级或降级用户级或系统级外部 CLI

#### Scenario: 生成完整性或格式尚未收敛
- **WHEN** checkpoint 检测到相关受管资产的 Component integrity/receipt 不匹配，或 `git diff --check` 报告可归因于当前任务的格式问题
- **THEN** Task Finish MUST 在 Candidate 前完成允许的修复并重新执行对应检查
- **AND** 无法证明修复范围或重新检查失败时 MUST 停止后续收尾

#### Scenario: 普通任务没有相关资产信号
- **WHEN** 当前任务不触及受管资产、lockfile、外部命令声明或 OpenSpec 升级信号
- **THEN** Task Finish MUST 记录 checkpoint 未触发的理由
- **AND** MUST 继续遵循既有 requiredAssurance、OpenSpec、Git integration 和 worktree lifecycle 流程

### Requirement: Task Finish 在 OpenSpec archive 后检查空 active-change scaffold
Buildr `task-finish` MUST 在完成 active OpenSpec change archive 后，以当前 OpenSpec CLI 的 status 与 strict validation 检查 archive 结果；该检查属于 closeout workflow check，不得替代 canonical spec sync/post-sync contract guard 或 task-verification evidence。

#### Scenario: archive 后遗留本次 change 的空 scaffold
- **WHEN** archive 后当前 CLI 仍将本次 change 识别为 active，且逐层检查证明遗留目录及其子目录均为空
- **THEN** Task Finish MUST 只删除该已证明为空的 scaffold 并再次运行 OpenSpec strict validation
- **AND** 最终报告 MUST 记录残留路径、空目录证据和复查结果

#### Scenario: archive 后残留非空或无法归因的状态
- **WHEN** active change 残留非空内容、属于其他 change，或无法证明由本次 archive 产生
- **THEN** Task Finish MUST 停止自动清理并报告状态与下一步
- **AND** MUST NOT 用目录名、空的父目录假设或批量删除扩大清理范围
