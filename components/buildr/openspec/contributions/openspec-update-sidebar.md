## Buildr OpenSpec Sidebar

`openspec-update-change` 只修订既有 planning artifacts，不授予实现、同步或归档权限。Task Environment 与 Task Development 是该 consumer 的条件依赖：纯 planning 修订可在 provider 未 ready 时安全降级；若本次修订需要新的实现、构建、测试、资源或执行位置变化，必须停止当前 update，先按正式 Task ID 重新运行 Task Environment `prepare`，取得 matching `ready`、明确 execution roots 与执行 CLI，并取得 matching Development context，随后用 `openspec-apply-change` 进入实现。

若修订后首次明确会产生用户可见前端 UI 变化，且当前任务尚未询问，确认用户是否需要界面预演稿（UI Preview）。只有用户明确确认后才加载独立 `ui-preview` Skill；拒绝、未确认或继续任务时不生成、不阻塞 update/apply，也不创建任何 planning 或 lifecycle 占位事实。

仅更新计划时不重复报告 upstream 已解析的 status 或 `changeRoot`。计划修订不得绕过 verification、Buildr baseline/check 或 task-finish 的既有门禁。

若本次修订改变 scope、核心流程、影响、验收或 delta requirements，读取 required `buildr.current-knowledge-maintenance/v1` binding、contract 和 selected provider，刷新 `brief.md` 并重新执行 `assess`；tasks 与 `.buildr/knowledge-impact.yml` 必须反映修订后的真实影响。Provider unresolved 或 dependency blocked 时停止并报告，不得保留已知陈旧 Brief/evidence。

正式Task中的planning artifact一旦改变，先重新运行strict validation，再从matching Environment Receipt取得`execution.workdir`并运行`buildr openspec convergence preflight <change> --project <project> --target <task-execution-root> --json`。Preflight `blocked`时在Planning Review前停止，由Agent处理active Change依赖或Change artifact语义后重跑strict与preflight；不把诊断改写成Review Result。只有current `ready`时才使用`buildr task next`返回的matching retained `environment.controllerInvocation`调用`__internal task-planning-identity inspect --task <task-id> --target <canonical-workspace>`，不得使用candidate `cliInvocation`或source driver。`resolved`后用返回的`target.identity`和全部`planningNodes`调用selected`buildr.task-development/v2`provider的`planning`；target变化使旧Planning Review/Candidate/handoff按Application事实失效，target不变则不重复record Review。Preflight或resolver `blocked`时停止，且不复制正文、不改写Review Result、不回退raw digest或旧target。最终converge仍按最新事实重新规划，不消费旧ready。

修订`tasks.md`时保持Change disposition前边界：每个checkbox都必须能在convergence/archive前完成。Formal Development、Task Verification/Candidate、Completion Review、Task Finish、Environment cleanup与Task terminal state属于archive后的Task lifecycle authority，不得作为Change task加入或保留。
