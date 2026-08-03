## Buildr OpenSpec Sidebar

应用 change 前先向用户说明正在使用 OpenSpec、`apply` action、change id 及其选择或推断来源。OpenSpec status 解析上下文后，在编辑前报告实际 `changeRoot`；正式实现任务同时报告 Task ID 与 Task Environment 的实际工作根。

采用 Task Environment 时，编辑前运行 `buildr task environment inspect <task-id> --target <canonical-workspace> --json`，只消费成功结果中的 `execution.workdir`、`allowedExecutionRoots`、controller 与 `cliInvocation`；不得从 cwd、branch、同一 HEAD 或 Git evidence 猜 ownership。普通 Rule/Skill 内容修改不要求 session activation；只有本任务修改 runtime 的发现、加载或激活机制，且专项验收明确要求真实 Agent host activation proof 时才交给 Task Verification。

实现 active change 时只编辑 change artifacts 与实现内容，不把 delta 预写入 canonical specs。Canonical sync/archive 只由 Task Finish 的单一 `buildr openspec converge` 事务执行；不得手工恢复 canonical、刷新 baseline、选择内部 stage 或直接运行 `--skip-specs` 掩盖事务失败。

当未完成的最后一项是“运行完整 Candidate”时，先保持该任务为 `- [ ]`，对当前 implementation identity 运行 Candidate。Candidate 成功后立即只把这一项由 `- [ ]` 改为 `- [x]`，并确认 `git diff` 中没有任务文本、顺序、其他 checkbox、其他文件或实现内容变化。

checkbox 变化仍会改变 target identity，并使此前的 current Task Verification Result 派生为 stale。需要 current Result 的 consumer 必须针对变化后的 target 执行适用的 required capability 并原子替换 Result；不得把任务 checkbox 视为 verification metadata 特例或复用旧 target 的 Result。

实现期间读取 required `buildr.current-knowledge-maintenance/v1` binding、contract 和 selected provider，执行 tasks 中的 Brief/current knowledge/terminology impacts；发现新的长期事实影响时同步更新 tasks 与 `.buildr/knowledge-impact.yml`。Implementation content 完成后、任何最终 verification 前执行 `reconcile`；结果 unresolved 时停止，结果 updated 时以更新后的 delivery tree 建立验证 evidence。
