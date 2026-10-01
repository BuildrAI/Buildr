## Buildr 规范归档接入

组合后的执行口径：本增强的唯一 `buildr openspec converge` 入口优先于后文通用归档步骤。后文的手工同步、移动目录或直接调用上游 archive 不在本工作空间独立执行；由 converge 统一调用上游并保留恢复边界。

写入前执行 `task-triage` 的默认隔离策略，复用当前任务工作树（Worktree）；只有用户明确要求在主开发分支修改时使用该位置。

用户已授权归档时，在已核对的实际工作根调用 `buildr openspec converge <change> --project <project> --target <actual-work-root> --json`。该命令检查相关变更冲突，复用锁定上游执行规范写入与归档，并保留必要中断恢复。不再另行手工同步后移动目录。归档在变基到开发主线最新提交后的任务工作树上执行；preflight 结果只作开发信号，converge 自行重新观察当前输入，不把旧基线预检当证据。用户要求收尾即包含归档授权，不因换阶段重复确认。

归档只移动该变更（Change）与其附属材料，包括具体变更说明（Change Brief）；独立任务说明（Task Brief）与共享项目正文保持原位置和正式引用，不随任何一个 Change 归档移动或删除，不复制旧说明冒充任务正文。新 Change Brief 中限定同一项目根的 `@project/` 逻辑引用归档后仍指向同一任务正文，普通相对链接保持原语义；旧 Change Brief 与历史不批量改写。

只在命令返回 passed 且实际归档成立时报告成功；失败时保留已经发生的效果。使用 `buildr openspec convergence inspect` 检查中断现场，不用归档状态替代业务交付或测试结论。只同步请求由独立同步入口处理。
