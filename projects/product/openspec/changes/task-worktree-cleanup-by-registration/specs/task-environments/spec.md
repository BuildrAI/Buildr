# task-environments 规范增量

## MODIFIED Requirements

### Requirement: Git worktree provider 必须只返回窄 Git evidence
Buildr MUST以`buildr.git-worktree-provider/v1`表达Git Worktree provider，并 MUST让默认`task-worktree` provider只拥有repository plan、checkout、branch、HEAD、remote、clean、worktree registration、caller-reviewed delivery input与Git cleanup effects。有存储证据时，清理 MUST 只按登记对象逐项执行，MUST NOT 递归扫描检出目录内容；无历史恢复时 MAY 在登记对象范围内做有界扫描，并跳过依赖与构建目录。Provider MAY由Agent、Task Finish或OpenSpec/Change reader直接调用，且 MUST不读取或兼容Task Environment、Task Contribution、Contribution Handoff、统一ready、业务交付、Preview资源或总cleanup结论。

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
- **THEN** provider MUST核对既有evidence或显式提供并经当前事实验证的对象、当前source提交、dirty、registration以及交付提交仍由非任务retained ref持有
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

#### Scenario: 缺少历史登记时接续清理
- **WHEN** 调用方提供明确的当前对象集合以及逐仓完整源与交付提交（Commit），但 Buildr 历史登记不存在
- **THEN** 提供者（Provider）MUST 从实际 Git 与当前来源核验路径、公共目录（Common Directory）、分支（Branch）、真实登记和完整嵌套集合，再按相同删除安全边界操作
- **AND** MUST NOT 补造历史创建记录；结果 MUST 区分本次观察与历史证据，未知创建起点 MUST 保持未知

#### Scenario: 没有登记也没有足够对象信息
- **WHEN** 清理既没有历史登记也没有明确的当前对象集合
- **THEN** 提供者（Provider）MUST 返回具体的接续诊断与零删除效果
- **AND** MUST NOT 仅因没有登记就返回 `cleaned`

#### Scenario: 显式对象不能覆盖真实冲突
- **WHEN** 当前对象与已有登记冲突、Git 身份不符、集合遗漏嵌套代码库（Repository）或对象被锁定及其他检出位置使用
- **THEN** 提供者（Provider）MUST 拒绝受影响的删除并保留现场
- **AND** MUST NOT 把输入本身当作已经核验的安全证明

#### Scenario: 无登记清理在部分删除后重试
- **WHEN** 工作树（Worktree）已删除但分支（Branch）尚存，或此前明确提供的全部对象均已不存在
- **THEN** 提供者（Provider）MUST 重新验证版本、占用及交付保留位置，安全继续剩余动作或逐项确认不存在
- **AND** 只有实际删除或逐项确认全部目标不存在后 MUST 返回 `cleaned`，并区分删除与不存在确认效果
