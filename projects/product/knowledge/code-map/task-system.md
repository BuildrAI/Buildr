# 任务系统的实现组织

这张地图回答：需求怎样进入任务协作，人在哪里参与决定，方案、实现、审查和收尾分别由谁负责。以下路径相对于 Buildr 产品根目录 `projects/product/`，只展开相关业务目录，止于文件层；职责以所列规范与当前实现为依据。

## 先理解职责怎样协作

**执行过程**：人讨论目标与约束 → 智能体（Agent）登记任务、选择独立位置并形成唯一任务说明（Task Brief） → 按实际需要保存方案及适用 OpenSpec 变化，分别判断审查与验证 → 在明确授权内实施并核对成果 → 完成交付与适用自举。Buildr 治理规则（Rule）、技能（Skill）及能力绑定，为智能体（Agent）提供工作基础；智能体（Agent）执行，具体能力保护自身写入。

**人机接续**：智能体（Agent）登记进展与明确事项 → Buildr Web 展示同一材料 → 人保存意见 → 智能体（Agent）重读答复和成果后继续。已有授权持续有效，网页保存答复不自动启动执行。

| 职责 | 当前实现与边界 |
| --- | --- |
| 规范依据 | [任务工作方式](../../openspec/specs/agent-task-workflows/spec.md)约束分流与隔离；[任务记录](../../openspec/specs/task-record/spec.md)约束短目标、说明正文、关系和结果；[任务材料](../../openspec/specs/task-materials/spec.md)约束过程文件引用、版本与旧说明导入；[工作摘要](../../openspec/specs/task-work-context/spec.md)约束进展、事项及答复。 |
| 工作基础 | Buildr 管理工作空间（Workspace）、项目与服务；治理规则（Rule）、技能（Skill）和能力绑定并投射给智能体（Agent），把方法、执行现场与用户可见入口连接起来。 |
| 接口入口（Interface） | 命令行（CLI）与超文本传输协议（HTTP）入口接收明确动作和已观察版本，调用同一应用；指令生成不代表执行。 |
| 应用服务（Application） | 任务应用维护短目标、记录正文与结果；独立任务材料应用（Task Materials Application）维护方案、实施和交付引用，过程正文仍在真实文件中；工作摘要（Work Context）维护接续；审查与验证分别保存真实专业结论。应用不代替人作授权决定。 |
| 领域模型（Domain） | 表达四态、父任务完成依据、摘要与事项、审查及验证报告的数据结构；任务记录的输入、关系和完成规则由应用负责。 |
| 数据访问与技术支撑 | 本机 SQLite 保存任务及各专业事实，事务内比较各自摘要；过程材料清单不改任务记录（Task Record）、数据库或历史；显式旧说明导入单独写入记录并释放旧关联，受控更新在逐任务文件锁内重读比较并原子发布。工作树（Worktree）与预览（Preview）分别核验资源，Git 和文件继续持有实际成果。 |
| 前端协作 | 工作台（Workbench）汇集明确关注事项；任务详情呈现目标、进展和成果；表单保留真实用户输入，冲突后重读；方案材料与代码按需并排查看。 |

## 任务说明与过程材料怎样落到实现？

任务说明（Task Brief）由任务记录（Task Record）的 `brief` 保存，与一句话目标 `intent` 区分。[任务领域](../../services/buildr/src/modules/task/domain/task.ts)定义 v4 正文及内容摘要；[输入校验](../../services/buildr/src/modules/task/application/task-validation.ts)保留原始 Markdown、将空值归为空并限制 UTF-8 体积。[命令应用](../../services/buildr/src/modules/task/application/task-command-application.ts)按已观察记录版本写入，正文变化进入终态更正历史及父任务验收观察。[查询应用](../../services/buildr/src/modules/task/application/task-query-application.ts)与[记录仓库](../../services/buildr/src/modules/task/persistence/task-repository.ts)让详情返回正文、列表只读摘要字段，两者使用一致的记录身份。工作台通过摘要读取 `inspectTaskSummaryView` 装配单任务和列表，工作摘要（Work Context）仅核对任务存在，不隐性读取说明正文。说明随主工作空间数据库保存，不随代码分支切换。

过程材料应用通过任务查询的 `readTask` 核对身份与范围，不使用解析变更可用性的 `inspectTask`。本机清单 `.buildr/local/task-materials/<task-id>/materials.json` 新写入使用 v2，只关联 `solution|implementation|delivery`，正文仍在项目文件或同任务固定目录中。旧 v1 的 `brief` 只供遗留诊断和显式导入，不作为任务说明兜底。[迁移应用](../../services/buildr/src/modules/task/materials/application/task-brief-migration.ts)比较记录、关联和真实文档版本，保留原文件及其他材料，释放旧说明关联，部分完成分别报告。已有正文时只释放退休关联；普通过程材料更新内部保留唯一旧关联，避免丢失迁移来源。[链接转换](../../services/buildr/src/modules/task/materials/application/task-brief-links.ts)按原来源将 Markdown 文档引用转为明确项目或已关联同任务材料路径，保留代码段和不可解析引用并报告诊断；[迁移命令](../../services/buildr/src/modules/task/materials/interfaces/cli/task-brief-migration.ts)提供单任务与明确批次入口，试读零写入。

[材料应用](../../services/buildr/src/modules/task/materials/application/task-materials-application.ts)在逐任务独占文件锁内重读、比较关联或本机正文摘要，再原子发布；读取零写入，正文与摘要来自同一字节观察。项目文件由真实工作树（Worktree）文件工具维护，应用锁不保护任意外部编辑器。[项目文档读取器](../../services/buildr/src/modules/task/materials/application/task-project-document-reader.ts)选择真实候选根，限制任务范围并拒绝越界、符号链接、非法编码及超限文件；候选缺失或身份漂移不回退主目录同名正文。仅服务工作树无法证明完整项目根时返回局部诊断。

[材料模块](../../services/buildr/src/modules/task/materials/module.ts)依赖任务查询、项目查询和工作树能力，不依赖 OpenSpec 查询。[HTTP 入口](../../services/buildr/src/modules/task/materials/interfaces/http/task-materials-http.ts)与[命令行入口](../../services/buildr/src/modules/task/materials/interfaces/cli/task-materials.ts)调用同一应用，旧项目文档入口也使用共享读取器。过程材料更新保持自己的版本，不重写记录正文或专业状态。

前端[正文阅读面](../../services/buildr-web/src/features/task/components/TaskReadingPane.tsx)直接以 Markdown 排版展示 `record.brief`，不提供原文切换；源码在任务编辑区查看和修改。不等待材料或变更请求，也不显示重复文件名。[节点材料投影](../../services/buildr-web/src/features/task/components/taskWorkContent.ts)仅将过程角色与辅助 OpenSpec 材料投射到设计、实施和收尾；实施清单仍由独立入口阅读。[材料钩子](../../services/buildr-web/src/features/task/hooks/useTaskArtifacts.ts)独立加载过程文件并取消旧请求，[材料阅读器](../../services/buildr-web/src/features/task/components/TaskMaterialReader.tsx)展示实际过程文件正文、来源与局部诊断，继续提供正文/原文切换。记录说明为空时明确显示尚未填写，旧变更说明在辅助入口按来源分别阅读，不选择主变更或合并正文。

共用[Markdown 主体](../../services/buildr-web/src/components/MarkdownHost.tsx)通过[任务引用解析](../../services/buildr-web/src/lib/taskBriefLinks.ts)识别严格的 `@task/<task-id>` 稳定任务引用，在当前工作空间进入对应任务，不依赖归档目录深度。记录正文使用明确的逻辑项目引用 `projects/<project>/<path>`；[共享文档解析](../../services/buildr-web/src/lib/workspaceMarkdownReferences.ts)核对当前任务范围与登记项目后按项目身份读取，支持附接项目（Attached Project），不拼接物理目录。旧普通文件链接保留原语义，不能扩大文件读取范围。[阅读状态](../../services/buildr-web/src/features/task/hooks/useTaskReadingState.ts)与[会话阅读历史](../../services/buildr-web/src/features/task/task-reading-history.ts)按工作空间、任务和浏览器历史条目保存有限快照，普通与组合任务的节点、方案选择及滚动分别接续。新打开任务默认说明；`@task` 链接明确进入记录正文，即使复用同任务阅读面也不会吞掉请求，浏览器返回恢复原条目的阅读选择。

审查和验证仍从各自应用按需读取；无结果只说明未记录，必要未完成、不适用理由由实际说明或工作摘要表达。真实执行结果和未覆盖理由分别呈现，材料存在不能推导完成。稳定的[浏览器回归](../../services/buildr-web/test/browser/task-materials-journey.ts)直接从列表打开节点、更新正文后刷新、验证无变更专业结果及真实归档后点击，不能只检查顶部链接或文件存在。

## 原型阅读怎样落到实现？

任务原型读取先确认任务存在，再独立读取关联变更及主工作空间（Canonical Workspace）的 `.buildr/local/task-prototypes/<task-id>/`；没有关联变更也能读取已保全的原型。来源以 `task` 与 `change` 区分，任务本机来源没有项目、变更或生命周期，使用独立身份命名域；本机目录逐级拒绝符号链接（Symbolic Link），失效变更不阻断安全来源。读取不创建目录、文件或任务记录，也不跟随工作树（Worktree）到同名本机目录。OpenSpec 查询复用带标记 HTML 的体积、深度和数量限制，`prototype-metadata.ts` 有界解析可选页面、状态和纯文本说明，非法说明仅产生局部提示。`TaskNodeContent.tsx` 把关键页面直接列入方案菜单，`PrototypeTab.tsx` 组合隔离画面与说明；`PrototypeReaderPage.tsx` 通过 `PrototypeReaderLayout.tsx` 提供任务限定的独立三栏阅读。原型不能获得真实写入能力，消息仅同步已声明阅读位置，并校验当前画面来源和装载标识。

实施清单与功能说明共同使用 `SideReadingPanel.tsx` 和 `useSideReading.ts`，复用悬停、固定及键盘退出。`PrototypeFeatureNotes.tsx` 仅适配 React 生命周期，卡片、区域高亮与消息联动的共同来源为 `services/buildr/resources/workspace/skills/buildr/ui-prototype/assets/feature-notes.js` 和配套样式，随原型技能分发；原型侧 `src/prototypes/prototype-bridge.ts` 复用同一来源。关联服务的正式和模拟入口共同使用 `ProjectServicesView.tsx`，操作由各入口接入。正式工作空间总览由 `WorkspaceOverviewPage.tsx` 通过 `useWorkspaceComposition` 读取当前组成登记。

## 提交记录怎样落到实现？

`commits/` 提供独立只读用例：命令行（CLI）与超文本传输协议（HTTP）调用同一 `task-commits-application.ts`，先核对任务，再解析其项目、服务、关联变更对应项目和已知任务工作树（Worktree）范围。`isWorkspaceOnlyTaskRecord` 为工作空间级任务（Workspace-only Task）选择其权威根目录本身的 Git 代码库，不回退到调用时目录或父级代码库。`git-commit-reader.ts` 读取真实 Git 引用与对象，以代码库（Repository）身份和完整哈希值（Hash）去重；本机未推送提交也在当前可达范围内，读取有界、不自动抓取远端。`task-commit.ts` 只把末尾规范 `Buildr-Task` 尾注（Trailer）视为归属，同值重复合并，非法值和不同值冲突返回诊断。结果说明已读来源、范围和局部失败，不新增持久关联表，也不调用任务状态、审查或验证写入。

[TaskDetailPage.tsx](../../services/buildr-web/src/features/task/pages/TaskDetailPage.tsx)在“任务收尾”后保留「改动与提交」标签，未增加工作阶段；打开详情时由[useTaskChangedFileCount.ts](../../services/buildr-web/src/features/task/hooks/useTaskChangedFileCount.ts)只读文件状态计数，不扫描提交或差异，不成为任务说明读取的前置条件。[TaskChangesPane.tsx](../../services/buildr-web/src/features/task/components/TaskChangesPane.tsx)组合读取与页面状态，[useTaskChangedFiles.ts](../../services/buildr-web/src/features/task/hooks/useTaskChangedFiles.ts)按需读取列表，[useTaskFileDiff.ts](../../services/buildr-web/src/features/task/hooks/useTaskFileDiff.ts)取得所选文件的完整上下文；明确刷新等待已打开列表及所选差异的当前结果。[TaskDiffReader.tsx](../../services/buildr-web/src/features/task/components/TaskDiffReader.tsx)是主从式工作台：左栏按仓库组织更改与提交，右栏提供左右对比与上下对比，两种模式保留首尾未修改内容，选中文件完整读取后定位第一处增删，同文件刷新保留人的阅读位置；上下对比使用单列行号，删除行显示旧行号，新增和普通行显示新行号；宽度不足时左右对比禁用并明确原因。工作台阅读控件调整文件栏及内容空间，不再由任务页壳层提供全屏。[TaskCommitRecords.tsx](../../services/buildr-web/src/features/task/components/TaskCommitRecords.tsx)的列表阅读仍保留完整说明、完整哈希及提交文件，部分结果和读取失败分别提示；任务尾注原样显示。

## 父任务协调怎样落到实现？

[父任务协调文章](../docs/architecture/task-system.md)解释整体目标与独立成果的关系，[完成时序图](../archify/flows/task-parent-coordination.html)展示核对、授权、写入与拒绝分支。实现复用本地图的任务查询、写入和存储，不维护另一份父子状态。

- **读取成果**：任务查询 → 父任务协调应用 → 任务详情中的 `ParentCoordinationPanel.tsx`。查询从当前父任务及直接子任务计算 `recordDigest` 与 `snapshotIdentity`；详情展示总体目标，面板展示各子任务结果和已保存的完成依据，不按子任务数量推断整体完成。
- **普通完成**：`useTaskActions.ts` 打开表单时重读协调结果；`ParentCompletionFields.tsx` 收集总体验收、逐个子任务处置及确认；`parentCoordination.ts` 把这些输入与已观察身份组成请求。任务写入应用在同一事务内核对任务版本、父子观察身份、子任务终态和处置完整性，成功后只保存这个父任务的结果与授权依据。
- **组合结束**：任务详情中的 `CompositeTaskEndDrawer.tsx` 读取当前快照，让用户对未结束子任务明确选择解除关联、完成或放弃，再通过 `taskApi.end` 调用 `endTask`，在事务中一起保存。子任务本身仍有子任务时，只能解除关联或先进入该子任务处理。上面的完成时序图仅展示普通完成。
- **处理冲突**：目标、关系或结果已变化时，后端拒绝陈旧输入；`useTaskActions.ts` 关闭旧完成表单、清除旧确认并重读。智能体（Agent）或人据当前成果重新判断；软件不替用户补造授权，也不自动结束其他任务。
- **保存答复**：工作摘要（Work Context）应用按自身版本保存事项答复，不调用任务完成写入。答复可以供智能体（Agent）继续判断，但不自动完成任务；若答复包含具体完成授权，仍须核对当前目标与成果，再调用有版本保护的完成动作。

## 规范与实现在哪里？

与「知识建设与维护」采用同一阅读方式：加粗目录标明业务组织层，默认先看到职责；点击目录或左侧引导线继续展开。文件后的说明用于理解该文件，再按需阅读原文。

- `./` — Buildr 产品根
  - `openspec/` — 行为承诺与变更材料
    - **`specs/agent-task-workflows/`** — 从意图到专业执行的工作方式
      - [spec.md](../../openspec/specs/agent-task-workflows/spec.md) — 分流、默认隔离、OpenSpec 与按需协作
    - **`specs/task-record/`** — 任务核心事实
      - [spec.md](../../openspec/specs/task-record/spec.md) — 短目标、说明正文、范围、关系、四态与完成依据
    - **`specs/task-work-context/`** — 人机接续
      - [spec.md](../../openspec/specs/task-work-context/spec.md) — 进展、明确事项、答复及并发保护
    - **`specs/task-review-results/`** — 两类审查
      - [spec.md](../../openspec/specs/task-review-results/spec.md) — 方案和完成审查的独立结果
    - **`specs/task-verification/`** — 真实验证报告
      - [spec.md](../../openspec/specs/task-verification/spec.md) — 检查、未覆盖项、内容身份及合法写入
  - **`services/buildr/src/modules/agent-assets/`** — 工作方法治理与运行时投射
    - [module.ts](../../services/buildr/src/modules/agent-assets/module.ts) — 组装规则（Rule）、技能（Skill）、能力绑定和运行时投射职责
  - **`services/buildr/src/modules/workspace/`** — 用户的工作空间（Workspace）管理
    - [application/workspace-query-application.ts](../../services/buildr/src/modules/workspace/application/workspace-query-application.ts) — 读取同一空间身份、项目、服务及登记事实
  - **`services/buildr/src/modules/task/`** — 后端任务事实与具体操作
    - `interfaces/` — 同一应用的多种入口
      - [cli/task.ts](../../services/buildr/src/modules/task/interfaces/cli/task.ts) — 创建、查看、修订、完成和放弃任务
      - [http/task-http.ts](../../services/buildr/src/modules/task/interfaces/http/task-http.ts) — 网页请求、输入转换与写入保护
    - `application/` — 组织任务用例
      - [task-query-application.ts](../../services/buildr/src/modules/task/application/task-query-application.ts) — 读取当前任务与直接子任务，计算单任务版本及完成相关父子观察身份
      - [task-command-application.ts](../../services/buildr/src/modules/task/application/task-command-application.ts) — 在同一事务内重验版本、父子观察身份和子任务处置，保存明确完成依据；失败不改状态
      - [task-validation.ts](../../services/buildr/src/modules/task/application/task-validation.ts) — 校验任务输入，以及父任务总体验收、逐子任务处置和授权来源与原意的合法结构
      - [parent-coordination-application.ts](../../services/buildr/src/modules/task/application/parent-coordination-application.ts) — 展示总体目标、直接子任务、未结束项和既有完成依据；旧计划仅作只读历史
      - [task-review-application.ts](../../services/buildr/src/modules/task/application/task-review-application.ts) — 保存方案或实现结果的审查结论
      - [task-verification-application.ts](../../services/buildr/src/modules/task/application/task-verification-application.ts) — 保存实际检查与未覆盖项，核对报告适用性
    - `domain/` — 业务事实及约束
      - [task.ts](../../services/buildr/src/modules/task/domain/task.ts) — 任务编码规则及任务、结果、父任务完成依据与更正历史的数据类；编码规则由输入校验和提交尾注解析共同复用，不执行完成校验
      - [task-review.ts](../../services/buildr/src/modules/task/domain/task-review.ts) — 被审对象、审阅范围与结论
      - [task-verification.ts](../../services/buildr/src/modules/task/domain/task-verification.ts) — 验证报告及结论约束
    - `persistence/` — 独立事实的保存
      - [task-repository.ts](../../services/buildr/src/modules/task/persistence/task-repository.ts) — 任务主表、说明正文与摘要、父身份和直接父关系；列表投影不读正文，更正历史随记录保全
      - [task-review-repository.ts](../../services/buildr/src/modules/task/persistence/task-review-repository.ts) — 两类审查槽的摘要比较与保存
      - [task-verification-repository.ts](../../services/buildr/src/modules/task/persistence/task-verification-repository.ts) — 当前验证报告的原子替换
    - **`work-context/`** — 进展、待决事项与人的答复
      - [application/work-context-application.ts](../../services/buildr/src/modules/task/work-context/application/work-context-application.ts) — 按摘要版本登记进展、保留或替换事项、保存答复；不改任务状态或代替完成授权校验
      - [domain/work-context.ts](../../services/buildr/src/modules/task/work-context/domain/work-context.ts) — 摘要、事项身份、状态和输入约束
      - [persistence/work-context-repository.ts](../../services/buildr/src/modules/task/work-context/persistence/work-context-repository.ts) — 独立版本保护与待处理查询
      - [interfaces/http/work-context-http.ts](../../services/buildr/src/modules/task/work-context/interfaces/http/work-context-http.ts) — 网页读取、记录与回应
      - [interfaces/cli/work-context-cli.ts](../../services/buildr/src/modules/task/work-context/interfaces/cli/work-context-cli.ts) — 智能体（Agent）读取和记录同一摘要
    - `infrastructure/` — Git 位置与删除安全
      - [git-worktree-provider.ts](../../services/buildr/src/modules/task/infrastructure/git-worktree-provider.ts) — 创建和检查真实位置，清理前复核归属与成果保留；linked worktree 目标在证据解析前归一到 canonical checkout 身份
      - [git-worktree-observation.ts](../../services/buildr/src/modules/task/infrastructure/git-worktree-observation.ts) — 从明确的当前对象核对来源、Git 身份与嵌套集合，保护既有位置及删除操作；不补造创建历史
    - **`materials/`** — 独立任务材料关联与真实正文阅读
      - [module.ts](../../services/buildr/src/modules/task/materials/module.ts) — 装配任务、项目与工作树能力，不依赖 OpenSpec
      - `application/`
        - [task-brief-migration.ts](../../services/buildr/src/modules/task/materials/application/task-brief-migration.ts) — 显式导入旧说明，按记录、关联和真实正文版本保护，分别报告写入和关联释放
        - [task-brief-links.ts](../../services/buildr/src/modules/task/materials/application/task-brief-links.ts) — 按旧文件来源转换可解析文档链接，保留代码与未知引用，不扩大文件范围
        - [task-materials-application.ts](../../services/buildr/src/modules/task/materials/application/task-materials-application.ts) — 读取引用与正文、关联版本保护及受控本机正文写入
        - [task-project-document-reader.ts](../../services/buildr/src/modules/task/materials/application/task-project-document-reader.ts) — 共享任务实际项目根选择及有界安全 Markdown 阅读
        - [task-materials-contracts.ts](../../services/buildr/src/modules/task/materials/application/task-materials-contracts.ts) — 应用、入口与类型生成共用的闭合关联/正文协议
      - `interfaces/`
        - [cli/task-brief-migration.ts](../../services/buildr/src/modules/task/materials/interfaces/cli/task-brief-migration.ts) — 单任务已观察版本与批次逐项迁移，支持零写入试读
        - [cli/task-materials.ts](../../services/buildr/src/modules/task/materials/interfaces/cli/task-materials.ts) — inspect、record 与 write 的同应用入口
        - [http/task-materials-http.ts](../../services/buildr/src/modules/task/materials/interfaces/http/task-materials-http.ts) — 任务限定读取、同源写授权与闭合输入校验
    - `change/application/` — 可关联的 OpenSpec 与原型阅读
      - [change-application.ts](../../services/buildr/src/modules/task/change/application/change-application.ts) — 关联变更与本机任务原型的独立发现、身份、安全读取和局部诊断
    - **`commits/`** — 当前可达提交的只读关联
      - [application/task-commits-application.ts](../../services/buildr/src/modules/task/commits/application/task-commits-application.ts) — 核对任务与明确来源，聚合去重后的提交、覆盖范围和局部诊断
      - [application/task-repository-scope.ts](../../services/buildr/src/modules/task/commits/application/task-repository-scope.ts) — 与 changed-files 共用的任务范围仓库与检出解析
      - [domain/task-commit.ts](../../services/buildr/src/modules/task/commits/domain/task-commit.ts) — 解析实际提交对象与规范任务尾注，区分合法、冲突和非法值
      - [infrastructure/git-commit-reader.ts](../../services/buildr/src/modules/task/commits/infrastructure/git-commit-reader.ts) — 核对真实代码库与工作树，限定读取引用和原始对象，不抓取远端或写入 Git
      - [interfaces/cli/task-commits.ts](../../services/buildr/src/modules/task/commits/interfaces/cli/task-commits.ts) — 接收任务编码与工作空间，输出同一任务提交结果
      - [interfaces/http/task-commits-http.ts](../../services/buildr/src/modules/task/commits/interfaces/http/task-commits-http.ts) — 网页任务限定读取入口，不接受调用者指定代码库或引用
    - **`changed-files/`** — 工作区改动与按提交列文件的只读观察
      - [application/task-changed-files-application.ts](../../services/buildr/src/modules/task/changed-files/application/task-changed-files-application.ts) — 聚合范围解析、工作区状态与提交文件结果；独立计数只读工作区路径
      - [domain/task-changed-file.ts](../../services/buildr/src/modules/task/changed-files/domain/task-changed-file.ts) — 变更文件状态与用户语义映射
      - [infrastructure/git-changes-reader.ts](../../services/buildr/src/modules/task/changed-files/infrastructure/git-changes-reader.ts) — 工作区状态、分支、按文件差异片段与按提交文件清单
      - [interfaces/cli/task-changed-files.ts](../../services/buildr/src/modules/task/changed-files/interfaces/cli/task-changed-files.ts) — 命令行同一任务变更文件结果
      - [interfaces/http/task-changed-files-http.ts](../../services/buildr/src/modules/task/changed-files/interfaces/http/task-changed-files-http.ts) — 网页任务限定读取入口
    - [module.ts](../../services/buildr/src/modules/task/module.ts) — 装配各独立能力及公开接口
  - **`services/buildr/src/modules/workbench/`** — 日常关注的组合阅读
    - [module.ts](../../services/buildr/src/modules/workbench/module.ts) — 工作台及偏好统一接入任务摘要端口，单任务关注项不加载说明正文
    - [application/workbench-application.ts](../../services/buildr/src/modules/workbench/application/workbench-application.ts) — 读取明确事项、任务和已有每日演进，不推断任务正在执行
    - [application/preferences-application.ts](../../services/buildr/src/modules/workbench/application/preferences-application.ts) — 单独维护置顶、接下来和资料偏好
  - **`services/buildr/src/infrastructure/sqlite/`** — 通用存储安全
    - [workspace-sqlite.ts](../../services/buildr/src/infrastructure/sqlite/workspace-sqlite.ts) — 真实工作空间（Workspace）和合法写入来源
    - [migrations/0035_add_task_brief.sql](../../services/buildr/src/infrastructure/sqlite/migrations/0035_add_task_brief.sql) — 连续追加任务正文及摘要列，保留原记录与历史
    - [transaction.ts](../../services/buildr/src/infrastructure/sqlite/transaction.ts) — 原子提交与失败回滚
  - **`services/buildr/src/web/application/`** — 临时预览资源
    - [preview-lifecycle.ts](../../services/buildr/src/web/application/preview-lifecycle.ts) — 核对实例与进程所有者，独立创建和停止预览（Preview）；`--task` 预览为服务目标工作树按需播种 canonical 任务库一致副本并在 owner 中如实标注来源
  - **`services/buildr/src/modules/openspec/application/`** — 变更文件发现与说明读取
    - [prototype-metadata.ts](../../services/buildr/src/modules/openspec/application/prototype-metadata.ts) — 有界解析 HTML 内可选说明，不新增独立状态
  - `services/buildr-web/src/` — 前端协作
    - **`components/`** — 共用侧边阅读
      - [SideReadingPanel.tsx](../../services/buildr-web/src/components/SideReadingPanel.tsx) — 说明与实施清单共用的容器
      - [useSideReading.ts](../../services/buildr-web/src/components/useSideReading.ts) — 悬停、固定、关闭与宽度限制
    - `lib/` — 阅读引用的限定语义
      - [workspaceMarkdownReferences.ts](../../services/buildr-web/src/lib/workspaceMarkdownReferences.ts) — 按登记与允许范围解析逻辑项目或原有工作空间文件引用，支持附接项目
      - [taskBriefLinks.ts](../../services/buildr-web/src/lib/taskBriefLinks.ts) — 校验稳定任务身份，在当前工作空间构造同任务详情路径
    - **`features/project/components/`** — 项目界面的共同来源
      - [ProjectServicesView.tsx](../../services/buildr-web/src/features/project/components/ProjectServicesView.tsx) — 过滤、单选即关联及失败反馈，由入口注入操作
    - **`features/task/`** — 当前任务与接续
      - `pages/`
        - [PrototypeReaderPage.tsx](../../services/buildr-web/src/features/task/pages/PrototypeReaderPage.tsx) — 任务限定的独立三栏阅读
        - [TaskDetailPage.tsx](../../services/buildr-web/src/features/task/pages/TaskDetailPage.tsx) — 目标、摘要、成果、关系与专业结果
      - `components/`
        - [TaskReadingPane.tsx](../../services/buildr-web/src/features/task/components/TaskReadingPane.tsx) — 记录说明仅展示排版正文，过程文件仍可查看原文；说明不依赖文件关联
        - [TaskEditModal.tsx](../../services/buildr-web/src/features/task/components/TaskEditModal.tsx) — 区分一句话目标与 Markdown 正文，保留编辑草稿与既有更正要求
        - [TaskNodeContent.tsx](../../services/buildr-web/src/features/task/components/TaskNodeContent.tsx) — 按过程材料与专业记录组织节点目录；说明直接读记录 brief，空值不兜底，变更说明保留辅助入口
        - [PrototypeTab.tsx](../../services/buildr-web/src/features/task/components/PrototypeTab.tsx) — 隔离预览、说明、状态选择与阅读消息校验
        - [PrototypeReaderLayout.tsx](../../services/buildr-web/src/features/task/components/PrototypeReaderLayout.tsx) — 独立任务阅读与离线预览共同使用的页面目录和阅读布局
        - [TaskAgentAction.tsx](../../services/buildr-web/src/features/task/components/TaskAgentAction.tsx) — 开始与继续工作的指令，按当前范围重新读取
        - [TaskWorkContextCard.tsx](../../services/buildr-web/src/features/task/components/TaskWorkContextCard.tsx) — 人查看与回应事项，冲突保留输入
        - [TaskArtifactReader.tsx](../../services/buildr-web/src/features/task/components/TaskArtifactReader.tsx) — 并排阅读真实方案和成果材料
        - [TaskCommitsPane.tsx](../../services/buildr-web/src/features/task/components/TaskCommitsPane.tsx) — 组合任务提交查询、展开状态及说明示例（组合任务页）
        - [TaskCommitRecords.tsx](../../services/buildr-web/src/features/task/components/TaskCommitRecords.tsx) — 按仓库分组展示实际提交、读取范围、局部失败与复制操作
        - [TaskChangesPane.tsx](../../services/buildr-web/src/features/task/components/TaskChangesPane.tsx) — 「改动与提交」工作台与列表视图的组合入口
        - [TaskChangedFiles.tsx](../../services/buildr-web/src/features/task/components/TaskChangedFiles.tsx) — 变更文件行、分组与状态标记
        - [TaskDiffReader.tsx](../../services/buildr-web/src/features/task/components/TaskDiffReader.tsx) — 主从式差异阅读面（左右/上下对比及完整文件上下文）
        - [useTaskChangedFileCount.ts](../../services/buildr-web/src/features/task/hooks/useTaskChangedFileCount.ts) — 详情打开和刷新时读取轻量计数，按工作空间与任务隔离缓存
        - [useTaskChangedFiles.ts](../../services/buildr-web/src/features/task/hooks/useTaskChangedFiles.ts) — 按任务进入或刷新读取变更文件，取消旧请求并区分加载、失败和已有结果
        - [TaskCompleteModal.tsx](../../services/buildr-web/src/features/task/components/TaskCompleteModal.tsx) — 完成摘要与父任务明确授权
        - [CompositeTaskEndDrawer.tsx](../../services/buildr-web/src/features/task/components/CompositeTaskEndDrawer.tsx) — 明确处置未结束子任务并组合结束
        - [ParentCoordinationPanel.tsx](../../services/buildr-web/src/features/task/components/ParentCoordinationPanel.tsx) — 展示直接子任务结果、父任务完成依据和局部历史诊断
        - [ParentCompletionFields.tsx](../../services/buildr-web/src/features/task/components/ParentCompletionFields.tsx) — 收集总体验收、逐子任务处置与明确确认；编辑内容后取消旧确认
        - [parentCoordination.ts](../../services/buildr-web/src/features/task/components/parentCoordination.ts) — 检查表单必填项、未结束子任务和明确确认，携带已观察身份生成完成输入
      - [task-reading-history.ts](../../services/buildr-web/src/features/task/task-reading-history.ts) — 保存最多 32 份阅读快照，区分工作空间、任务及历史条目，不作为任务业务状态
      - [hooks/useTaskReadingState.ts](../../services/buildr-web/src/features/task/hooks/useTaskReadingState.ts) — 接续普通/组合节点、方案与滚动，按历史条目恢复，稳定任务链接明确进入正文
      - [hooks/useTaskActions.ts](../../services/buildr-web/src/features/task/hooks/useTaskActions.ts) — 完成前重读、提交版本与授权；冲突后清除旧确认、刷新成果，等待重新判断
      - [hooks/useTaskWorkContext.ts](../../services/buildr-web/src/features/task/hooks/useTaskWorkContext.ts) — 刷新与取消旧请求，防止不同任务内容混入
      - [hooks/useTaskCommits.ts](../../services/buildr-web/src/features/task/hooks/useTaskCommits.ts) — 按任务进入或刷新读取，取消旧请求并区分加载、失败和已有结果
    - **`features/workbench/`** — 日常关注入口
      - [pages/WorkbenchPage.tsx](../../services/buildr-web/src/features/workbench/pages/WorkbenchPage.tsx) — 等我回应（明确的决定、验收或补充信息请求）、继续推进、项目变化与常用资料；没有回应请求时紧凑展示

## 哪些专业方法指导执行？

点击技能（Skill）名称查看方法。这里说明它指导谁做什么，不把技能（Skill）串成软件自动执行的状态机。

| 技能（Skill） | 职责 |
| --- | --- |
| [任务分流（task-triage）](../../services/buildr/resources/workspace/skills/buildr/task-triage/SKILL.md) | 核对需求、范围与授权，判断语义影响并选择实际工作位置 |
| [规范建设（OpenSpec）](../../services/buildr/resources/workspace/skills/openspec/openspec-propose/SKILL.md) | 指导智能体（Agent）写方案与行为承诺，按授权接续实施和适用归档 |
| [任务管理（task-manager）](../../services/buildr/resources/workspace/skills/buildr/task-manager/SKILL.md) | 形成、保存及接续记录中的唯一任务说明（Task Brief），维护任务、工作摘要（Work Context）、真实答复及父任务完成依据 |
| [工作树管理（task-worktree）](../../services/buildr/resources/workspace/skills/buildr/task-worktree/SKILL.md) | 创建、检查和安全清理明确归属的独立位置 |
| [任务审查（task-review）](../../services/buildr/resources/workspace/skills/buildr/task-review/SKILL.md) | 按目标与风险审查方案或实现结果，保存真实结论 |
| [任务验证（task-verification）](../../services/buildr/resources/workspace/skills/buildr/task-verification/SKILL.md) | 直接运行项目检查，区分检查通过、未覆盖与完成报告 |
| [Git 操作（git-operations）](../../services/buildr/resources/workspace/skills/buildr/git-operations/SKILL.md) | 精确执行已授权操作；明确正式任务时写入任务尾注并分别核对真实提交与任务读取 |
| [收尾与交付（task-finish）](../../services/buildr/resources/workspace/skills/buildr/task-finish/SKILL.md) | 核验成果、完成实际交付，保存已有任务结果并处理安全善后 |
| [当前知识维护（current-knowledge-maintenance）](../../services/buildr/resources/workspace/skills/buildr/current-knowledge-maintenance/SKILL.md) | 维护受影响的文章、技术图（Technical Diagram）与代码地图（Code Map） |

自举激活由工作空间级 `buildr-self-bootstrap-sync` 唯一执行器承担；其技能（Skill）和两个脚本可从[自举图的来源](../archify/flows/task-self-bootstrap.html)读取。它按已交付范围执行同步、同步结果提交、应用更新和最终核验，不拥有任务完成状态。

## 成果保存在什么地方？

- `knowledge/` — 本主题可独立维护的成果
  - [index.yml](../index.yml) — 阅读身份、来源关联与文件说明
  - `docs/architecture/`
    - [task-system.md](../docs/architecture/task-system.md) — 精简架构主文
  - `code-map/`
    - [task-system.md](task-system.md) — 规范、职责与实现地图
  - `archify/flows/`
    - [task-system.json](../archify/flows/task-system.json) — 完整过程与角色职责图源
    - [task-system.html](../archify/flows/task-system.html) — 总图展示
    - [task-self-bootstrap.html](../archify/flows/task-self-bootstrap.html) — 自举与安全善后时序
    - [task-parent-coordination.json](../archify/flows/task-parent-coordination.json) — 父任务完成时序图源
    - [task-parent-coordination.html](../archify/flows/task-parent-coordination.html) — 核对成果、明确授权、保存完成与拒绝分支

地图按职责定位文件，源码内容由当前文件提供；没有改变的实现不因改写地图重新验证。实际存储与交互的代表检查见[任务记录回归](../../services/buildr/test/system/task-record-product.test.ts)、[父任务完成输入回归](../../services/buildr-web/test/parentCoordination.test.mjs)和[工作摘要与工作台回归](../../services/buildr/test/integration/workbench-application.test.ts)。

## 任务图的来源与表达边界

[总图](../archify/flows/task-system.html)以涉及正式任务（Task）和 OpenSpec 的完整实现为例：讨论与分流对应核心规则和任务分流，方案、两类审查、验证和交付对应前文专业方法及各自应用，工作基础、过程协作与交付支撑对应前文工作资产、工作空间（Workspace）、工作台（Workbench）与任务应用。箭头是常见协作和前后依赖，不是所有工作必须经过的状态机（State Machine）；纯调查、小改动、无正式任务和无自举组件的工作按实际范围进行。图不保存完整对话或逐次工具日志。

[父任务完成图](../archify/flows/task-parent-coordination.html)只展开普通完成请求；网页组合结束另见本图的实现说明。人明确目标和完成授权，调用入口可以是智能体（Agent）的命令或人的网页表单，二者不是固定串联。通过与拒绝是互斥分支。读取的 `recordDigest` 对应 `expectedRecordDigest`，`completion.snapshotIdentity` 对应 `parentCompletion.expectedSnapshot`；授权记录保留 `source` 与 `statement`。同一事务（Transaction）核对父子观察、直接子任务状态和逐项验收，不递归修改其他任务，也不执行 Git、发布或清理。

| 拒绝原因 | 接续方式 |
| --- | --- |
| `task_record_conflict` 或 `parent_completion_conflict` | 重读记录及父子观察，重新核对成果和原授权是否仍适用 |
| `parent_completion_children_open` | 先完成或明确处置未结束子项，不自动完成或放弃 |
| `parent_completion_children_mismatch` | 对照当前直接子任务补齐或修正逐项处置 |
| 缺少验收或授权依据 | 核对已有效的授权，只有确实缺少决定时才询问 |

网页答复保存和父任务完成是独立动作；同范围已有授权持续有效，但软件仅校验输入结构，不认证自然语言授权或实际业务成果。

### 自举图的适用条件

[自举图](../archify/flows/task-self-bootstrap.html)只适用于已安装 `buildr-self-bootstrap`、已交付改动命中输入的工作空间（Workspace），不包含首次交付或 npm 发布。唯一执行器为已安装 `buildr-self-bootstrap-sync` 中的 `scripts/closeout.mjs`：`runDirectSelfBootstrapCloseout` 按范围编排，`classifications` 判断适用输入。任务编号可选；它不是任务完成或清理总控制器。

执行器从基线、交付提交、分支、远端、宿主和保留 Node 核对真实现场；检查目标身份、干净目录、锁、祖先及远端包含关系。适用时从保留目录同步，精确提交实际变化并普通推送，安装开发应用，以 `verifyDevelopmentEntryIdentity` 核对入口、版本、通道和源码身份，再由同一入口完成 Doctor。原来健康运行的开发实例才按连续性脚本证据恢复；不能把应用安装或文件渲染成功当作完整激活。

结果为 `passed`、`blocked` 或 `not-applicable`；成功要求最终 `health.ready === true`。推送等局部失败不撤销已交付事实，可按同一输入恢复；未提交内容、未知锁和身份漂移先保留。后续清理由原工作树（Worktree）或预览（Preview）所有者独立核对，不借自举结果推断资源可删。具体来源由知识索引连接唯一技能（Skill）及执行器、连续性脚本；[执行器测试](../../services/buildr/test/integration/self-bootstrap-closeout.test.ts)只证明测试覆盖的分支，不证明某次真实激活。

### 规范与实现的核对点

[自举编排规范](../../openspec/specs/task-closeout-orchestration/spec.md)、[任务工作方式](../../openspec/specs/agent-task-workflows/spec.md)和[任务环境规范](../../openspec/specs/task-environments/spec.md)分别约束自举适用性、工作位置与退役。当前执行器的任务编号可选，工作树（Worktree）提供者只管理 Git 位置和删除安全，不自动执行 Doctor 或同步；持久修改默认隔离，用户明确指定原地修改时例外。移除自举任务前置的决定可追溯至[归档变更](../../openspec/changes/archive/2026-09-08-remove-self-bootstrap-task-prerequisite/specs/agent-task-workflows/spec.md)。这些边界不能从旧执行记录或图的线性顺序反推。
