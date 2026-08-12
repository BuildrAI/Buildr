## MODIFIED Requirements

### Requirement: Task Finish canonical CLI 必须只有 run 与 inspect
Buildr CLI MUST只提供`task finish run`和`task finish inspect`：首次`run` MUST只要求`--task <task-id>`，并从matching ready Task Environment与Task Development Application解析current Development Handoff、Candidate/generation和Content Target；`inspect` MUST只读返回canonical run状态。默认target branch MUST来自retained Workspace当前符号分支，显式`--target-branch` MUST与该分支一致；delivery remote MUST来自显式参数、Environment evidence、target branch upstream或唯一configured remote。当前客户端 MUST NOT注册、加载或执行`actions|advance|resume|renew|recover|cleanup-prepare|cleanup-finalize`，也 MUST NOT接受`--project`、`--change`、assurance/Result bytes、caller-authoredCandidate/evidence/fingerprint/execution-plan/recovery参数。

#### Scenario: 查询 canonical Task Finish 帮助
- **WHEN** 用户运行`buildr help task finish`、`buildr help task finish run`或`buildr help task finish inspect`
- **THEN** 输出 MUST只把run/inspect表述为canonical actions，并说明首次run需要Task ID、current Development Handoff、ready Environment、retained target与可确定remote
- **AND** MUST NOT声称target branch来自worktree start point，或要求调用方理解Project/Change、Candidate kind、step、attempt、action registry或recovery manifest

#### Scenario: 省略 Change 创建 code-only run
- **WHEN** Task Development已经为Change引用为`0..N`的Task形成current handoff
- **THEN** 调用方 MUST只用`task finish run --task <task-id>`进入同一产品执行器
- **AND** CLI MUST把Change context保持为opaque handoff fact，不推断candidate kind或任意active Change

#### Scenario: 调用旧 action
- **WHEN** 调用方使用旧maintenance action、`--project`、`--change`、Verification summary或caller Candidate参数
- **THEN** CLI MUST作为不存在、不支持或unknown argument拒绝
- **AND** MUST NOT加载旧reader/executor、创建run、写Development Receipt或启动Verification

#### Scenario: Canonical store 中存在旧 run shape
- **WHEN** 当前客户端运行或检查Task Finish且canonical store中仍有非v2 run shape
- **THEN** 自动选择 MUST跳过旧shape，显式inspect MUST fail closed
- **AND** MUST NOT加载旧reader、生成迁移receipt或把旧passed evidence映射为新phase

## ADDED Requirements

### Requirement: OpenSpec CLI help 不得恢复 Task Finish 的旧 Change authority
Buildr CLI MUST把`openspec baseline create`、`openspec check`、`openspec converge`与`openspec audit`描述为各自的OpenSpec contract/maintenance入口，并 MUST NOT把任一命令表述为current Task Finish stage、required action或恢复路径。Task Finish current help MUST明确Change convergence、sync与archive在Development stable Content Target之前完成。

#### Scenario: 查询 OpenSpec 兼容入口帮助
- **WHEN** 用户查询`buildr help openspec baseline create`或`buildr help openspec check`
- **THEN** help MAY说明其兼容诊断用途
- **AND** MUST NOT声称“新 Task Finish 使用 openspec converge”或引导Finish读取/修改Change

#### Scenario: 查询 Task Finish 帮助
- **WHEN** 用户查询canonical Task Finish help
- **THEN** help MUST说明Finish只消费current Development Handoff并执行carrier/delivery/cleanup
- **AND** MUST NOT列出OpenSpec command、Change convergence、sync或archive为Finish operation
