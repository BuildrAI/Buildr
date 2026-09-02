## Buildr OpenSpec Sidebar

应用 change 前先向用户说明正在使用 OpenSpec、`apply` action、change id 及其选择或推断来源。OpenSpec status 解析上下文后，在编辑前报告实际 `changeRoot`；正式实现任务同时报告 Task ID 与 Task Environment 的实际工作根。

若 current proposal、design 或 delta specs 表明会产生用户可见前端 UI 变化，确认用户是否需要界面原型（UI Prototype）。只有当前任务已有明确确认，才在正式前端实现编辑前加载 selected `ui-prototype` Skill完成真实 UI 调查、一个或多个完整页面生成和逐页浏览器验证；用户拒绝、未确认或要求继续时不生成并直接继续 apply。当前 Task 已有原型且用户未明确要求忽略时，任何正式前端编辑前必须读取全部相关原型，并按其信息架构、布局和交互开发；需要成为正式行为的选择写入 design、delta specs、Brief 与 tasks。UI Prototype 与忽略选择不构成 Planning Review、Implementation、Verification、Convergence 或 Finish gate。

任何实现编辑前，确认 apply-required artifacts 已完成并运行上游 `openspec validate <change> --strict`，再从matching Environment Receipt取得`execution.workdir`并运行`buildr openspec convergence preflight <change> --project <project> --target <task-execution-root> --json`。Preflight `blocked`时在apply前停止，由Agent按active Change conflict、Scenario omission、rename/identity conflict、projected validation或其他semantic diagnostic处理依赖、修订artifact或请求用户决定，再重跑strict与preflight；不得自动补回Scenario、选择rename、修改canonical或把blocker写入Review Result代替处理。

只有preflight返回current `ready`后，正式Task才使用matching `task environment inspect`返回的retained controller调用`__internal task-planning-identity inspect --task <task-id> --target <canonical-workspace>`，用`resolved`结果的`target.identity`与`planningNodes`更新Development planning；不得使用candidate `cliInvocation`或source driver。preflight或resolver `blocked`时停止并报告诊断，不得用raw digest、路径、mtime、checklist progress或Git ref回退。Agent可按目标独立执行Planning Review，但Review不拥有、复制或解释preflight逻辑，也不决定apply许可。delta Requirement identity 后续改变时必须重新执行strict validation、preflight与resolver。Preflight ready只绑定当前delta、canonical、active Changes与executable，不是写入授权；最终converge始终按最新事实重新规划验证。不得把该检查放回早于Change创建的task triage，也不得创建、刷新、读取或采用旧baseline/阶段sidecar。

采用 Task Environment 时，编辑前运行 `buildr task environment inspect <task-id> --target <canonical-workspace> --json`，只消费成功结果中的 `execution.workdir`、`allowedExecutionRoots`、controller 与 `cliInvocation`；不得从 cwd、branch、同一 HEAD 或 Git evidence 猜 ownership。普通 Rule/Skill 内容修改不要求 session activation；只有本任务修改 runtime 的发现、加载或激活机制，且专项验收明确要求真实 Agent host activation proof 时才交给 Task Verification。

实现 active change 时只编辑 change artifacts 与实现内容，不把 delta 预写入 canonical specs。完成实现、当前认知与适用的直接验证反馈后，必须先完成全部Change-owned checkbox，再调用单一`buildr openspec converge`事务执行deterministic canonical sync/archive；不得手工恢复canonical、刷新baseline、选择内部stage或直接运行`--skip-specs`掩盖事务失败。

开始apply以及每次修订`tasks.md`时，立即逐项确认checkbox能在Change convergence/archive前完成；只表达Change disposition前可完成的工作，不为这项自检预读完整下游流程。不得包含Formal Development、Task Verification/Candidate、Task Finish、Environment cleanup或Task terminal state，也不得把Task Review写成统一推进门禁。Convergence/archive在Task Development观察stable Content Target和形成Formal Development handoff之前完成；Task Finish不调用、不拥有也不解释Change checklist或convergence/archive。

`buildr openspec converge`会在任何receipt/canonical/archive写入前检查现有checkbox；存在未完成项时必须消费`change-checklist-incomplete`并修订或完成真实Change task，不得自动勾选、删除任务或用归档后lifecycle evidence绕过门禁。

Converge正常返回`passed + archived`后，正式Task再次调用Task Planning Identity resolver：`resolved`时用当前identity更新Development planning，`blocked`时停止Development mutation并处理诊断。Review是否需要重做由Agent重新观察subject后独立判断。此处不运行`buildr openspec convergence inspect`。只有Converge中断或报告恢复不确定，且当前Task Environment现场仍存在时，才用该只读Inspect区分before、expected与unknown；Formal Task Finish、Environment cleanup及清理后的历史读取不得要求Receipt或重新运行Inspect。

实现期间读取 required `buildr.current-knowledge-maintenance/v1` binding、contract 和 selected provider，执行 tasks 中的 Brief/current knowledge/terminology impacts；发现新的长期事实影响时同步更新 tasks 与 `.buildr/knowledge-impact.yml`。Implementation content 完成后、任何最终 verification 前执行 `reconcile`；结果 unresolved 时停止，结果 updated 时以更新后的 delivery tree 建立验证 evidence。
