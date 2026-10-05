## Buildr OpenSpec Sidebar

组合后的执行口径：本增强对授权接续的约束优先于后文通用的等待实现确认提示；它不扩大已授权范围，也不允许在规划动作内修改实现。

用户只要求提案时，完成规划材料后停止。用户已明确授权同一目标的规划与实现时，既有授权不因调用规划技能（Skill）而失效；先完成并展示规划成果，再由智能体（Agent）接续 `openspec-apply-change`。规划动作自身仍只修改规划材料。范围或业务决定改变时才请求必要确认，不能用本增强推导新的授权。

创建 Change 前先向用户说明正在使用 OpenSpec、`propose` action 和预定 Change ID；status 解析后，在写入前报告实际 `changeRoot`。

正式任务登记与实际隔离位置核对后，先由 `task-manager` 在任务记录（Task Record）的 `brief` 字段形成或接续唯一任务说明（Task Brief），再引用它规划具体变更（Change）。任务可有零到多个 Change，多任务可共享同一 Change 或方案文档，但每个任务拥有自己的说明正文。Change root 的 `brief.md` 是具体变更说明（Change Brief），只解释本次变化并通过稳定引用（如 `[任务说明](@task/<task-id>)`）指向对应任务，不复制任务需求。稳定任务引用限定当前工作空间，不受归档目录深度影响；正文引用项目文件时使用明确的 `projects/<project>/<path>`。旧文件链接保留原语义，旧说明与历史不批量改写。

先取得正式Task Record并核对实际工作位置。创建规划文件前执行 `task-triage` 的默认隔离策略，使用已确认的实际工作位置。Git 文件默认复用当前任务工作树（Worktree）；只有用户明确要求在主开发分支修改时使用该位置。已确认的非 Git 资料在已授权实际位置维护，不要求工作树或初始化仓库；身份未明只停止依赖该身份的写入。创建顺序为：`openspec new change`、`task update --add-change`、写proposal/design/specs/tasks。Application不额外保存规划快照；Agent直接读取当前artifacts判断是否完整、是否需要审查以及下一步做什么。

若可能产生用户可见界面变化，只在用户明确要求后使用界面原型（UI Prototype）；已有原型且未被明确忽略时，实现应读取它。原型不是门禁或状态。

完整 planning artifacts 必须有适用于当前材料的 `openspec validate <change> --strict` 与 `buildr openspec convergence preflight` 结果。后续动作复用仍适用的结果；材料、检查规则或相关进行中变更变化时，只刷新受影响检查，不创建新的检查状态库。Agent 根据当前诊断处理 active Change 冲突、上游规范诊断或规范条目冲突，不把诊断转写为统一许可、Review Result 或 Application 状态。方案审查（Planning Review）、实现审查（Implementation Review）与任务验证（Task Verification）分别按任务目标、真实方案选择、范围、风险和证明需要判断，不机械按 `change-flow` 默认审查或排除其他路径；需要的方案审查使用当前真实材料或专业接口返回的身份，结果未形成时如实说明缺口，不生成占位。报告规划材料齐备或移交实现前，核对 Change root 内 `brief.md` 实际存在且为本次生成；缺失时先补齐或如实说明缺口，不把缺失表述为已就绪。

读取当前认知维护（Current Knowledge Maintenance）能力，创建或刷新`brief.md`，执行`assess`，并把真实地图、技术图、解释文档与适用术语影响写入 tasks；已有 `.buildr/knowledge-impact.yml` 时同步维护，不要求第二份影响清单。写`tasks.md`时只包含Change收敛前可完成的实现、当前认知和直接验证动作；任务验证、任务收尾、资源清理与Task终态不属于Change checklist。

当前知识协作使用 `buildr.current-knowledge-maintenance/v3`。已有建设授权内连续完成成果；范围外有价值缺口先给出具体建议，辅助记录和非关键漂移只形成局部提醒，不能阻止无关验证、同步或交付。
