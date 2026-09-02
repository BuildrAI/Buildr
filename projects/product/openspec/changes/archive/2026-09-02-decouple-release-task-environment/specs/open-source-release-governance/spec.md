## MODIFIED Requirements

### Requirement: Publication 必须从已完成 Task 的权威环境事实重建

Buildr Release MUST在matching release Worktree中使用冻结source的Buildr Service`package.json`、`package-lock.json`和Product exact Node执行`npm ci`。Preparation Result MUST保存source inputs、cwd、command、Node和outcome identity，MUST NOT保存stdout、凭证或Task Environment Plan/Receipt。无副作用readiness MUST只读取该Result，不得执行依赖安装。

#### Scenario: Release Task Finish 已清理 worktree
- **WHEN** exact Node在matching release Worktree的Buildr Service root执行`npm ci`成功且inputs未漂移
- **THEN** Release MUST形成current Preparation binding

- **AND** workflow MUST在冻结Buildr Service root按同一`npm ci`入口重建依赖
- **AND** MUST NOT完成或重开Task、恢复旧worktree或在`projects/product`执行`npm ci`

#### Scenario: recipe、cwd 或 lockfile 不匹配
- **WHEN** `npm ci`失败或source inputs、Node、cwd漂移
- **THEN** Release MUST只阻塞依赖该准备的readiness，不改变Task、Candidate、Git或Publication事实

### Requirement: 发布完成必须以零中间资源和正式release ref核验为边界

Publication和dev provenance已成立后，Release closeout MUST从canonical Workspace即时解析retained controller，完成release Task后直接调用Worktree provider cleanup，再运行Doctor。Worktree或Doctor cleanup失败 MUST保留已成立的Publication、Task结果和Git convergence事实。

#### Scenario: 默认保留正式远端release branch
- **WHEN** Publication、matching dev provenance reconciliation已成立且正式远端release branch精确等于冻结release commit
- **THEN** closeout MUST记录该正式ref为`retained-and-verified`并完成Task、直接调用Worktree cleanup与Doctor
- **AND** 未请求正式ref删除 MUST NOT产生blocked或要求新的协调Task

#### Scenario: 中间资源漂移
- **WHEN** 任一generation carrier、worktree或local lifecycle ref的ownership、dirty状态或expected identity无法证明
- **THEN** closeout MUST返回blocked资源清单并保留已成立Publication、Task completion、reconciliation与其他已清理事实
- **AND** MUST NOT删除未知branch、worktree、正式release ref或其他version资源
