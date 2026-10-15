## Buildr OpenSpec Sidebar

组合后的执行口径：本增强对普通错误的修复边界优先于后文通用的遇错暂停提示；真实 blocked 结果须先解决原因，不得绕过。

已授权实现遇到可逆且范围内的普通错误时，智能体（Agent）自行定位、修复并复查受影响内容。仅在业务语义无法确定、需要扩大授权、错误对象写入、覆盖他人工作或不可逆风险时局部暂停。不得绕过命令返回的 blocked 状态、缺失的必要材料或真实检查失败；先解决其原因，再继续。

应用Change前先向用户说明OpenSpec `apply` action、Change ID、实际`changeRoot`、Task ID与按默认隔离策略确认的实际工作根。

读取由 `task-manager` 保存的任务记录（Task Record）`brief`，以唯一任务说明（Task Brief）核对整体目标与完成依据，具体变更读取适用提案、设计、规范和实施清单。任务可关联零到多个变更（Change），多任务可共享同一 Change 或方案文档，但各自说明独立。需要任务入口时使用稳定引用（如 `[任务说明](@task/<task-id>)`），限定当前工作空间；正文引用项目文件时使用明确的 `projects/<project>/<path>`。归档不改变记录正文或任务身份；旧文件链接和历史保留原语义。任务理解变化时由 `task-manager` 按已观察记录版本更新正文。Buildr 不再生成、刷新或要求 `brief.md`，当前知识维护只承载实际受影响且已获授权的长期成果。

若 artifacts 表明会产生用户可见界面变化，只在用户明确要求后使用界面原型（UI Prototype）。已有原型且未被明确忽略时，正式前端编辑前应读取它；原型不是审查、实现、验证、收敛或收尾门禁。

进入实现前，确认 apply-required artifacts 已完成，并核对已有 `openspec validate <change> --strict` 和 `buildr openspec convergence preflight` 结果。材料与检查规则未变时复用严格验证；冲突预检还需核对相关进行中变更及规范现场。结果缺失、相关输入变化或无法确认适用性时补跑对应检查，不因阶段切换或每次编辑重复执行。Agent 根据当前诊断处理依赖、修订 artifacts 或请求必要的用户决定；Application不另存规划快照，也不把 preflight 变成统一许可层。方案审查（Planning Review）、实现审查（Implementation Review）与任务验证（Task Verification）分别按任务目标、真实方案、范围、风险和证明需要判断，不机械继承 `change-flow`。所需方案审查尚未完成时补做或说明实际缺口；缺少记录不自动形成门禁，也不能推断不适用或已通过。

写入前执行 `task-triage` 的默认隔离策略，使用已确认的实际工作位置。Git 文件默认复用当前任务工作树（Worktree）；只有用户明确要求在主开发分支修改时使用该位置。已确认的非 Git 资料在已授权实际位置维护，不要求工作树或初始化仓库；身份未明只停止依赖该身份的写入。核对相关项目（Project）和服务（Service）登记、真实资料路径、身份、版本与授权范围；仅对 Git 对象核对检出位置（Checkout）、引用（Ref）与适用工作树证据（Worktree Evidence）；不得从cwd、branch、路径相似、旧Receipt或同一HEAD猜ownership。实现期间只编辑Change artifacts与实现内容，不预写canonical specs。

完成实现、当前认知和直接验证反馈后，完成全部Change-owned checkbox；apply 阶段自身不归档。按目标与风险需要执行实现审查（Implementation Review）：对照当前任务说明（Task Brief）与适用方案核对真实实现，没有方案审查也可独立执行并保存真实结果。未执行或 `changes-requested` 不自动阻塞归档，但须如实说明覆盖、未覆盖与尚未解决的必要目标或风险；需要但未完成不得称不适用、通过或整体完成。已在实现阶段执行且仍适用于当前内容的检查，在任务仍为 `active` 时经 `task-verification` 登记为正式任务验证报告；`completed` 后报告槽位锁死，不得等到任务完成之后再补登记。实际 Git 位置冻结候选前先把任务工作树变基到开发主线最新提交，按验证适用性重跑受影响验证；非 Git 位置直接核对当前材料、来源与已观察版本，不要求变基（Rebase）。再执行预归档检查：`buildr openspec convergence preflight` 加主规格漂移审查（对本 change 触及 capability 的主规格核对当前正文及已观察来源；Git 场景复核任务基点以来的 diff）。冲突按预归档分类处理：Git 基线陈旧时重新变基；非 Git 来源变化时重新读取当前材料并核对版本，delta 与最新主规格失配回到 change artifacts 修订，同一 requirement 语义冲突请求用户决定。归档授权按任务收尾交付语义判定：用户要求收尾或明确要求归档时，在已确认实际工作根调用`buildr openspec converge`；只同步时使用独立同步入口。不得以任务验证、任务收尾、资源清理或Task终态替代Change checklist。Converge成功后，Agent直接读取归档结果和真实代码现场继续审查、验证与交付；没有额外研发回执。

实现期间执行 tasks 中的当前认知与术语影响；发现新的长期事实影响时同步更新 tasks 及已采用的 `.buildr/knowledge-impact.yml`。按真实影响执行 `reconcile`；仅解释文档变化时检查文档与引用，复用仍适用的代码测试。

当前知识协作使用 `buildr.current-knowledge-maintenance/v4`。已有建设授权内连续完成成果；范围外有价值缺口先给出具体建议，辅助记录和非关键漂移只形成局部提醒，不能阻止无关验证、同步或交付。
