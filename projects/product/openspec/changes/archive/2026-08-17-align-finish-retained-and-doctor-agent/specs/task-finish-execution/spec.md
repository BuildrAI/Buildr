## ADDED Requirements

### Requirement: Preflight 必须观察 retained 与目标远端对齐
`preflight` MUST在创建 Delivery Carrier 或任何 delivery mutation 之前，观察 retained canonical Workspace 当前符号分支与本次 run 绑定的目标远端 ref。观察 MUST复用交付模块既有 Git identity 事实，不得另造检查器，也不得执行 `fetch`、rebase、merge 或 working tree 写入。retained 落后、分叉、detached、脏工作区导致无法证明可快进对齐，或远端 ref 无法观察时，preflight MUST fail closed；prepare、verify、deliver 与 cleanup MUST保持未执行。该失败 MUST NOT登记为新的 `task_finish.entry_gaps` 缺口码。`deliver` 现有 `retained-workspace-not-ready` 检查 MUST继续作为第二道防线。

#### Scenario: retained 已与目标远端对齐
- **WHEN** retained 当前符号分支等于 run 的 target branch，工作区可证明 clean，且 HEAD 等于已观察的远端 target ref
- **THEN** preflight MUST将该对齐观察记为通过
- **AND** MUST继续后续阶段，不得因该观察创建 Git mutation

#### Scenario: retained 落后目标远端
- **WHEN** retained 当前分支可快进到已观察远端 target ref，但 HEAD 不等于该 ref
- **THEN** preflight MUST blocked，code 标识 retained 未对齐
- **AND** MUST零 carrier、lease、push 与 retained activation
- **AND** MUST NOT把该失败写成 `task_finish.entry_gaps`

#### Scenario: retained 与目标远端分叉
- **WHEN** retained HEAD 与远端 target ref 不在可快进祖先关系中
- **THEN** preflight MUST fail closed 并报告 diverged
- **AND** MUST NOT rebase、merge 或改写共享历史

#### Scenario: 远端 target ref 无法观察
- **WHEN** preflight 无法只读观察目标远端当前 ref
- **THEN** preflight MUST fail closed
- **AND** MUST NOT把超时或不可达伪装成已对齐
- **AND** MUST NOT执行 fetch、rebase 或 working tree 写入

### Requirement: Finish run agent 必须来自 Environment adapter
创建 Finish run 时绑定的 Doctor agent MUST等于 matching ready Task Environment Receipt 的 controller adapter。调用方省略 `--agent` 时，产品 MUST使用该 Environment adapter，MUST NOT猜测当前聊天宿主或默认为 Codex。调用方传入 `--agent` 且与 Environment adapter 不一致时，产品 MUST在入口聚合的 `environment` 分类返回既有 mismatch 缺口，MUST NOT创建 run。deliver 执行 retained Doctor 时 MUST使用该冻结 run agent。

#### Scenario: 省略 Finish --agent
- **WHEN** Environment adapter 为 `codex`，调用方运行 `task finish run` 且未提供 `--agent`
- **THEN** 产品 MUST把 run agent 记为 `codex`
- **AND** retained Doctor MUST以 `--agent codex` 执行

#### Scenario: Finish --agent 与 Environment 一致
- **WHEN** Environment adapter 为 `cursor`，调用方传入 `--agent cursor`
- **THEN** 产品 MUST接受该值并冻结为 run agent
- **AND** MUST NOT改写为另一个宿主

#### Scenario: Finish --agent 与 Environment 不一致
- **WHEN** Environment adapter 为 `codex`，调用方传入 `--agent cursor`
- **THEN** 产品 MUST返回 `environment` 入口缺口且不创建 run
- **AND** MUST NOT用聊天宿主执行 Doctor
