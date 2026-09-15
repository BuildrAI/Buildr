# OpenSpec Change 生命周期

1. Agent依据用户目标、canonical specs、当前认知、实现和active Changes判断是否需要OpenSpec Change；Task Record保存Change引用，OpenSpec自己拥有proposal、design、delta specs与tasks。
2. 首次持久文件修改前执行任务分流技能（task-triage）的默认隔离策略，创建或复用当前任务工作树（Worktree）；只有用户明确要求在主开发分支修改时使用该位置，纯规划材料同样适用。OpenSpec本身不要求统一Task Environment。
3. `openspec-propose`创建Change并维护 Brief、真实知识影响任务及已采用的 `.buildr/knowledge-impact.yml`。Application不另存规划快照；Agent直接读取当前artifacts判断完整性和是否需要Planning Review。
4. apply前运行`openspec validate <change> --strict`和`buildr openspec convergence preflight`。Preflight使用锁定的 OpenSpec 1.13.0 检查当前变更与相关规范冲突，不复制全项目做隔离验证；诊断由Agent处理，不转成统一许可或Review Result。
5. `openspec-apply-change`在已确认的实际工作根内实现Change-owned tasks。开发反馈由Agent直接调用项目工具；当前知识维护按明确范围执行 `assess/reconcile`，完成已授权的代码地图、技术图与解释文档。
6. 需要归档且全部Change checkbox闭合后，调用`buildr openspec converge`，由锁定上游完成标准规范写入及归档。只同步时使用上游同步技能并保留变更，不调用归档命令。Converge复核当前输入并保留必要中断恢复；只有中断或恢复不确定时才使用只读`convergence inspect`。
7. Converge成功后，Agent重新观察当前代码、Archived Change、canonical specs、Git、Review、Verification和实际资源，按目标继续审查、验证与交付。

OpenSpec流程不要求额外任务研发聚合、候选代次、统一推进决定或交接。某项专业结果缺失只影响实际依赖它的判断或动作。

当前知识协作统一使用 `buildr.current-knowledge-maintenance/v3`。辅助记录缺失或陈旧时直接核对相关事实；非关键缺口和未授权建设只形成局部提醒。只更新受实际内容或运行条件变化影响的验证，解释文档变化不要求重跑无关代码测试。归档本身不附带知识写入，后续独立维护按新近观察的事实和已有有效授权执行。
