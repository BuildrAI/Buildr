# task-environments Specification

## Purpose
定义统一Task Environment退役后的产品边界：普通工作不需要环境记录，位置、准备、资源与清理由独立owner负责。

## Requirements

### Requirement: Git worktree provider 必须只返回窄 Git evidence
Buildr MUST以`buildr.git-worktree-provider/v1`表达Git Worktree provider，并 MUST让默认`task-worktree` provider只拥有repository plan、checkout、branch、HEAD、remote、clean、worktree registration、caller-reviewed delivery input与Git cleanup effects。Provider MAY由Agent、Task Finish或OpenSpec/Change reader直接调用，且 MUST不读取或兼容Task Environment、Task Contribution、Contribution Handoff、统一ready、业务交付、Preview资源或总cleanup结论。

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
- **AND** 相同plan重试 MUST幂等复用matching checkout，不得自动回滚

#### Scenario: provider 被直接检查
- **WHEN** 调用方执行`worktree inspect`
- **THEN** 结果 MUST只报告当前Git evidence和本次effects
- **AND** MUST不返回或暗示统一ready、runtime projection、依赖或业务结果

#### Scenario: 已核验交付直接清理
- **WHEN** Agent提供逐仓成对完整`expected-source`与`delivered-ref`
- **THEN** provider MUST核对evidence、当前source提交、dirty、registration以及交付提交仍由非任务retained ref持有
- **AND** 删除前任一事实漂移 MUST拒绝对应删除，已成立交付事实保持不变

#### Scenario: ancestor关系证明正常集成
- **WHEN** 调用方没有提供reviewed delivery input，但明确integrated ref包含Task branch HEAD且worktree没有source drift
- **THEN** provider MUST按ancestor evidence执行精确cleanup
- **AND** MUST保留其他Task与远端refs

#### Scenario: 等价任务贡献证明正常集成
- **WHEN** 调用方只提供旧Task Contribution或Environment等价证明
- **THEN** 当前Worktree provider MUST拒绝该输入
- **AND** caller MUST提供当前`expected-source`与`delivered-ref`或可重算ancestor事实

#### Scenario: provider 执行清理
- **WHEN** 全部逐仓删除条件保持成立
- **THEN** provider MUST按nested-first删除精确Task-owned worktrees、本地任务分支和provider evidence
- **AND** MUST不删除远端ref、其他Task资源或未证明归属的目录

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

### Requirement: 工作树调用指引必须在不同宿主中保持契约与资源归属一致

Buildr 的工作树（Worktree）调用指引 MUST 要求智能体（Agent）在创建、检查和清理时遵循当前有效能力绑定（Capability Binding）及 `buildr.git-worktree-provider/v1`，保留 `.worktrees/<task-id>`、逐仓身份与删除安全保证。指引 MUST 区分工具可用、契约兼容和既有资源归属，MUST NOT 把某一宿主的原生工具或目录当成通用例外。

#### Scenario: 宿主同时提供原生创建工具
- **WHEN** 当前宿主存在原生工作树（Worktree）工具，但没有证据证明它是满足当前契约的已选提供者（Provider）
- **THEN** 指引 MUST 要求按已有绑定调用，不凭工具可用性替换实现或默认目录
- **AND** 宿主硬性要求无法与当前契约同时满足时 MUST 说明具体不兼容，只停止受影响动作

#### Scenario: 当前任务已有其他入口创建的位置
- **WHEN** 当前任务已有工作位置，但已选提供者（Provider）不能核实其身份或兼容既有证据
- **THEN** 指引 MUST 要求保留现场并报告差异
- **AND** MUST NOT 为满足目录约定另建同任务副本、自动迁移或补造登记

#### Scenario: 绑定变化后尝试清理旧资源
- **WHEN** 当前能力绑定（Capability Binding）与既有工作树（Worktree）的创建实现不同
- **THEN** 指引 MUST 要求先核对真实资源归属及新实现对既有证据的兼容性
- **AND** 无法核验时 MUST 保留目录，不混用清理入口，也不撤销已成立的交付事实

### Requirement: 新工作树标识默认使用稳定语义名称

Buildr 的任务与工作树（Worktree）指引 MUST 在为新工作选择任务标识（Task ID）时默认使用简短、稳定的语义名称，不主动添加日期。已有任务标识（Task ID）和用户明确命名 MUST 继续沿用；该默认值 MUST NOT 改变命令接受的合法格式或创建另一套名称字段。

#### Scenario: 没有既有标识或用户指定名称
- **WHEN** 智能体（Agent）需要为新工作选择标识且用户没有规定命名
- **THEN** 指引 MUST 使用 `worktree-contract-consistency` 这类语义名称，不因当天日期主动添加前缀
- **AND** 必须区分同名但不同的任务时 MUST 核对真实归属并使用简短语义后缀，而不是复用他人目录

#### Scenario: 既有标识或用户命名包含日期
- **WHEN** 继续已有任务或用户明确指定了合法的带日期名称
- **THEN** 指引 MUST 保留其标识和已有位置，不拒绝、截去日期、另建记录或自动重命名

#### Scenario: OpenSpec 变更进入归档
- **WHEN** 关联的 OpenSpec 变更归档并获得归档日期
- **THEN** 指引 MUST 保持工作树（Worktree）与分支名称不变
- **AND** 归档本身 MUST NOT 替代原有交付核验和清理条件
