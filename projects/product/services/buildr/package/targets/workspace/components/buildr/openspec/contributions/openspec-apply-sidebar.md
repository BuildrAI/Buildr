## Buildr OpenSpec Sidebar

应用 change 前先向用户说明正在使用 OpenSpec、`apply` action、change id 及其选择或推断来源。OpenSpec status 解析上下文后，在编辑前报告实际 `changeRoot`；正式实现任务同时报告 Task ID 与 Task Environment 的实际工作根。

采用 Task Environment 时，编辑前运行 `buildr task environment inspect <task-id> --target <canonical-workspace> --json`，只消费成功结果中的 `execution.workdir`、`allowedExecutionRoots`、controller 与 `cliInvocation`；不得从 cwd、branch、同一 HEAD 或 Git evidence 猜 ownership。普通 Rule/Skill 内容修改不要求 session activation；只有本任务修改 runtime 的发现、加载或激活机制，且专项验收明确要求真实 Agent host activation proof 时才交给 Task Verification。

实现 active change 时只编辑 change artifacts 与实现内容，不把 delta 预写入 canonical specs。完成实现、当前认知与适用的直接验证反馈后，必须先完成全部Change-owned checkbox，再调用单一`buildr openspec converge`事务执行deterministic canonical sync/archive；不得手工恢复canonical、刷新baseline、选择内部stage或直接运行`--skip-specs`掩盖事务失败。

`tasks.md`只表达Change disposition前可完成的工作，不得包含Formal Development、Task Verification/Candidate、Completion Review、Task Finish、Environment cleanup或Task terminal state。Convergence/archive在Task Development观察stable Content Target和形成Formal Development handoff之前完成；Task Finish不调用、不拥有也不解释Change checklist或convergence/archive。

`buildr openspec converge`会在任何receipt/canonical/archive写入前检查现有checkbox；存在未完成项时必须消费`change-checklist-incomplete`并修订或完成真实Change task，不得自动勾选、删除任务或用归档后lifecycle evidence绕过门禁。

实现期间读取 required `buildr.current-knowledge-maintenance/v1` binding、contract 和 selected provider，执行 tasks 中的 Brief/current knowledge/terminology impacts；发现新的长期事实影响时同步更新 tasks 与 `.buildr/knowledge-impact.yml`。Implementation content 完成后、任何最终 verification 前执行 `reconcile`；结果 unresolved 时停止，结果 updated 时以更新后的 delivery tree 建立验证 evidence。
