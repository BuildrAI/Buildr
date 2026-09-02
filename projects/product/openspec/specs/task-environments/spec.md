# task-environments Specification

## Purpose
定义统一Task Environment退役后的产品边界：普通工作不需要环境记录，位置、准备、资源与清理由独立owner负责。
## Requirements

### Requirement: Git worktree provider 必须只返回窄 Git evidence
Buildr MUST以`buildr.git-worktree-provider/v1`表达Git Worktree provider，并 MUST让默认`task-worktree` provider只拥有repository plan、checkout、branch、HEAD、remote、clean、worktree registration、caller-reviewed delivery input与Git cleanup effects。Provider MUST可由Agent、Task Finish、OpenSpec/Change reader或过渡Environment直接调用，且 MUST NOT判断或保存Environment runtime/CLI/依赖、统一`ready`、业务交付、Preview资源或总cleanup结论。

#### Scenario: 创建默认单仓 worktree
- **WHEN** Agent为明确Task选择Workspace root Worktree
- **THEN** provider MUST在`.worktrees/<task-id>`创建或复用root repository worktree
- **AND** MUST返回可复核的repository、checkout、branch、HEAD、clean与registration evidence

#### Scenario: 创建显式多 repo worktrees
- **WHEN** Agent提供一个或多个明确Project/Service selectors
- **THEN** provider MUST从canonical registries与实际Git boundaries解析source path、remote和integration branch
- **AND** MUST将每个nested worktree放在Task checkout内对应的canonical `source.path`，不得自动包含全部repositories

#### Scenario: repository plan 存在冲突
- **WHEN** selector、remote、branch、tracked target、路径、未知文件或既有worktree owner冲突
- **THEN** provider MUST在任何`git worktree add`前fail closed
- **AND** MUST返回失败selector、当前事实与未执行effects

#### Scenario: 多 repo 创建中途失败
- **WHEN** 完整预检通过后某个nested worktree创建失败
- **THEN** provider MUST保留已成功创建的checkout和分支并写入逐仓blocked evidence
- **AND** 相同plan重试 MUST幂等复用匹配checkout，不得自动回滚

#### Scenario: provider 被直接检查
- **WHEN** 调用方执行`worktree inspect`
- **THEN** 结果 MUST只报告当前Git evidence和本次effects
- **AND** MUST NOT返回或暗示Environment ready、runtime projection、依赖或业务结果

#### Scenario: 已核验交付直接清理
- **WHEN** Agent提供逐仓成对完整`expected-source`与`delivered-ref`
- **THEN** provider MUST核对evidence、当前source提交、dirty、registration以及交付提交仍由非任务retained ref持有
- **AND** 删除前任一事实漂移 MUST拒绝对应删除，已成立交付事实保持不变

#### Scenario: ancestor关系证明正常集成
- **WHEN** 调用方没有提供reviewed delivery input，但明确integrated ref包含Task branch HEAD且worktree没有source drift
- **THEN** provider MUST按ancestor evidence执行精确cleanup
- **AND** MUST保留其他Task与远端refs

#### Scenario: 等价任务贡献证明正常集成
- **WHEN** 旧过渡Environment仍提供可独立复算的source、baseline、carrier、target与Task Contribution identity
- **THEN** provider MAY只在完整identity完全匹配时清理旧Task worktree
- **AND** MUST NOT把该兼容路径变成新`worktree cleanup`公共输入或信任caller claimed equivalence

#### Scenario: provider 执行清理
- **WHEN** 全部逐仓删除条件保持成立
- **THEN** provider MUST按nested-first删除精确Task-owned worktrees、本地任务分支和provider evidence
- **AND** MUST NOT删除远端ref、其他Task资源或未证明归属的目录

### Requirement: Buildr不得提供统一Task Environment模块

Buildr MUST不提供统一Task Environment Application、Plan、Receipt、ready状态、恢复、资源注册、总cleanup、CLI、HTTP、Web页签或SQLite current。普通编辑、构建、测试、Review、Verification、Finish和交付 MUST不因缺少环境记录而失败。

#### Scenario: 普通任务直接工作
- **WHEN** Agent在已确认Workspace进行普通代码修改且不需要独立Worktree或额外准备
- **THEN** Buildr MUST不创建任何Environment记录
- **AND** Agent MAY直接编辑、构建、测试、Review、Verification与交付

#### Scenario: 局部资源失败
- **WHEN** Preparation、Preview或Worktree cleanup中的具体动作失败
- **THEN** 失败 MUST只影响依赖该动作的工作
- **AND** 已成立的Task结果、Verification、交付或Publication事实 MUST保持成立
