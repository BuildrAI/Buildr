## Buildr 独立规范同步

组合后的执行口径：已授权的规范同步作为一个明确范围连续完成，不逐文件重复请求许可；本增强优先于后文通用的确认提示。未知业务语义只暂停受影响条目，保留其他已完成效果。

写入前执行 `task-triage` 的默认隔离策略，使用已确认的实际工作位置。Git 文件默认复用当前任务工作树（Worktree）；只有用户明确要求在主开发分支修改时使用该位置。已确认的非 Git 资料在已授权实际位置维护，不要求工作树或初始化仓库；身份未明只停止依赖该身份的写入。

用户要求同步规范而保留变更时，按上游 openspec-sync-specs 技能（Skill）执行。先在已核对的实际工作根运行 `buildr openspec convergence preflight <change> --project <project> --target <actual-work-root> --json`，处理与当前规范有关的冲突，再按授权范围更新并核对正式规范。

本入口保持变更进行中，不调用包含归档的 `buildr openspec converge`。preflight 只证明本次观察与相关冲突检查；上游 archive 命令的程序化写入与异常回滚保证不自动覆盖智能体直接编辑规范的路径。只有用户要求归档时，转交归档入口。
