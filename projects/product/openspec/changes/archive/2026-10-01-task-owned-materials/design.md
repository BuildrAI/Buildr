## Context

根因与目标见提案（proposal.md）和独立任务说明（../../../tasks/task-owned-materials/brief.md）。现有 Task Record v3 已支持零到多个 Change，并维护身份、状态和历史；专业审查与验证已能用于无 Change 任务。缺口在材料归属与读取：`taskDocuments()` 只投影 Change artifacts，`intent` 普通文档链接不进入节点。普通项目 Markdown 后端读取已有，但位于 Change Application 且强依赖 OpenSpec 查询。

## Goals / Non-Goals

**Goals:**
- 正式节点、命令行与智能体观察同一任务材料正文与当前摘要，保留稳定接续位置。
- 用最小独立关联能力复用现有文件现场解析，避免修改 Task Record schema、数据库与历史。
- 保留专业应用权威，准确区分材料/记录缺失与业务上不适用。

**Non-Goals:**
- 不从聊天生成材料，不强制长模板，不增加检查状态库或工作流审批。
- 不把原型目录改为任意附件库；不新建知识收纳平台，不批量生成历史说明。
- 不扩大普通任务的 OpenSpec 采用范围，不改外围导航和主题，不发布版本。

## Decisions

### 1. 任务拥有说明，清单只拥有引用

独立 Task Materials Application 保存固定本机清单 `.buildr/local/task-materials/<task-id>/materials.json`。清单以 `schemaVersion: buildr.task-materials/v1` 和 `documents` 表达关联；条目包含 `id`、`role: brief|solution|implementation|delivery`、`title` 与 `source`。来源为 `{kind: task, path: <relative-md>}` 或 `{kind: project, project: <code>, path: <project-relative-md>}`。至多一个 `brief`；其他角色零到多个。正文不进入清单、Task Record 或聊天状态。

任务本机正文固定在同一任务目录中的 Markdown 文件；项目源正文可存 `tasks/<id>/brief.md`，也可明确关联已有文档。不要求所有工作进入 knowledge。共享材料可由多任务或多条来源引用，不声明排他所有权；同一明确文档不得复制为多个同义正文。新任务由 task-manager 在登记与隔离后形成最低说明并正式关联；缺失时页面如实显示，不以空占位或 intent 兜底。

选择本机清单而非新增 DB 字段，是因为需要的是任务与文件的关联及可读取性，不改变任务状态与父子完成身份。清单不进入列表扫描，详情按需读取。任务本机材料不会随 Git 推送；需要跨机器交付的正文保存在项目源，关联属于本机任务事实。清理本机材料不附带任务完成或工作树删除。

### 2. 独立读写与最小版本保护

提供 `task materials inspect|record|write` 命令和任务限定 HTTP 读取/写入，调用同一应用。inspect 零写入返回 `materialsDigest: absent|sha256-…`、明确引用、逐项当前正文、实际正文摘要、来源和局部诊断。record 仅更新完整关联清单，在逐任务独占锁内重读并比较已观察 `expectedCurrent`，原子发布；新关联校验真实作用域和文件，不因未改动旧失效引用阻止解除关联。

write 仅修改任务本机 Markdown，以 `expectedDocumentDigest` 校验已观察正文版本，与清单引用分别写入；项目文件继续由真实 Git 工作树中的文件工具修改，智能体写前核对已观察内容，发布后读取新的 digest。HTTP 不提供任意路径写入。路径拒绝穿越、绝对路径、符号链接、非普通文件及过大正文；文件读写固定有界。并发冲突显式返回，不能自动覆盖或重放。

抽离现有 Task project file-root resolver/Markdown 读取，使普通任务材料依赖 Task Query、Project Query 和 Worktree Provider，不依赖 OpenSpec Query。核对任务存在使用 `readTask`，避免 inspect 的 Change availability 旁路。matching Worktree 有效时读取其项目候选，不回退主目录同名旧文件；身份异常是局部诊断。规范变更的 active/archive 读取仍由现有 Change resolver 负责。

### 3. 页面围绕材料，而非 Change 组织

Task artifacts hook 独立加载材料清单；节点直接把 brief 的真实正文交给现有 Markdown 阅读容器。方案、实施及交付角色进入现有对应目录和阅读容器；清单浮窗继续复用，OpenSpec artifacts 是来源之一。每份材料显示身份、来源与正文摘要；缺失、读取失败、加载未完成分别表达。刷新同时更新关联、正文及已加载的专业结果，不让旧请求混入新任务。

旧任务没有显式 brief 关联时（包括已有清单但仅含其他角色）保留已有 Change briefs 的只读阅读，明确标记“历史变更说明，非独立任务说明”，不合并多个 brief，不选主 Change。明确关联 brief 后，不再用旧 brief 覆盖；正文缺失时显示具体诊断而非回退伪装齐备。顶部普通链接保持原用途，不自动推断正式关联。

审查仍在方案/实施中，验证仍在实施中。没有记录不能推断不适用或通过；未执行需由真实方案/工作摘要说明，业务不适用理由同样在既有材料记录，不新增专业状态。验证报告展示现有实际 checks（passed/failed）与 gaps 中的未执行、不可用、缺少测试等真实原因，不将未覆盖项当成实际失败或不适用，也不新增检查 outcome 枚举。旧结果与当前对象分别核对。

### 4. OpenSpec 与技能职责

task-triage 分别判断规范变化、材料深度、两类审查与验证需要；后两项不继承 change-flow。task-manager 管理独立说明的形成、保存、关联、更新和接续；OpenSpec 自有增强指向该任务说明，Change brief 解释具体变化并引用唯一任务正文。多变更引用同一任务说明，多任务引用同一变更时不互相覆盖。task-review 分别明确审方案选择与实现兑现，task-verification 按目标证明，task-finish 核对必要材料交付/关联/实际节点可读。current-knowledge-maintenance 只承载可长期复用的知识和具体 Change 解释，不成为任务报告默认收纳处。

现有 capability contracts 仍保持各自最小职责；新增材料动作不改变 `buildr.task-record/v3` 的 closed record、副作用或历史，不将材料能力伪称该旧契约的扩展字段。只改 Buildr-owned 源技能和 sidebar，不手改第三方正文/受管投射。

## Risks / Trade-offs

- [本机关联不随源码推送] → 如实区分项目正文交付与本机引用；提供者在目标 canonical Workspace 保存关联，独立预览采用明确隔离快照，不回灌。
- [失效引用与工作树身份漂移] → 保留逻辑引用、逐项诊断，不隐藏旧材料、不以主目录替代候选。
- [文件并发修改] → 材料应用受控的 record 与本机 write 通过逐任务锁内 CAS 和原子发布保护；清单和正文独立观察版本。外部编辑器、Git 或通用文件工具不遵守此锁，项目正文写前重读、发现变化后重新判断，不能声称提供全局原子 CAS。读取摘要只对应本次正文 bytes，不证明任务完成或所有入口写入安全。
- [既有规范互相冲突] → 同步修订 short intent、空材料与 Change brief、按 change-flow 默认审查等整块规范，不只改前端或技能。
- [组件投射遗留] → 产品源完整性按实际修改验证；安装副本故障留给唯一自举执行器，不以随意改摘要消除。

## Migration Plan

默认读取零写入。旧 Task Record、时间、历史、Change briefs、归档与专业报告不迁移、不删除、不改写。旧 Change brief 只提供带来源的历史阅读；旧普通链接不自动成为材料关联。会随归档移动的 active Change brief 继续通过已有逻辑变更引用提供兼容阅读，不把其物理项目路径登记为独立说明；已归档固定文件或适用普通文档经核验可显式关联，标明本次关联事实。需要独立整体说明时新写任务正文并引用旧变更解释，不复制同义需求，不把补写伪装成过去已有。新生成的 Change→Task 链接采用项目根逻辑 Markdown 形式 `@project/tasks/<id>/brief.md`；共用项目链接解析器识别该限定前缀，普通相对链接保持原语义，禁止前缀内路径穿越。归档深度改变不改变其目标，也不改写旧 brief。原 `repository-header-layout` 文档仍在原知识位置，本任务只将其作为隔离回归来源，不重开任务。

当前任务使用项目源 `tasks/task-owned-materials/brief.md`，Change brief 只引用它。正式交付后由本机材料动作登记此引用，工作树清理后读取 retained 项目源。回退旧代码不删除新清单或正文；旧版本保留 Task identity 与专业结果，但无法展示新增关联能力，应如实说明。
