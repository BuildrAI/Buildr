# OpenSpec Change 生命周期

1. Agent依据用户目标、canonical specs、当前认知、实现和active Changes判断是否需要OpenSpec Change；Task Record保存Change引用，OpenSpec自己拥有proposal、design、delta specs与tasks。
2. 需要持久实现或受管执行根时先取得匹配Task Environment；仅维护OpenSpec、规则、Skill、文档或模板时可以使用共享执行根。
3. `openspec-propose`创建Change并维护Brief与`.buildr/knowledge-impact.yml`。Application不另存规划快照；Agent直接读取当前artifacts判断完整性和是否需要Planning Review。
4. apply前运行`openspec validate <change> --strict`和`buildr openspec convergence preflight`。Preflight只检查当前delta、canonical、active Changes与projected validation；诊断由Agent处理，不转成统一许可或Review Result。
5. `openspec-apply-change`在Task Environment允许的根内实现Change-owned tasks。开发反馈由Agent直接调用项目工具；Current Knowledge按Project执行`assess/reconcile`并维护长期知识。
6. 全部Change checkbox闭合后调用单一`buildr openspec converge`事务完成canonical sync和archive。Converge永远重读最新事实；只有中断或恢复不确定时才使用只读`convergence inspect`。
7. Converge成功后，Agent重新观察当前代码、Archived Change、canonical specs、Git、Review、Verification和Environment，按目标继续审查、验证与交付。

OpenSpec流程不要求额外任务研发聚合、候选代次、统一推进决定或交接。某项专业结果缺失只影响实际依赖它的判断或动作。
