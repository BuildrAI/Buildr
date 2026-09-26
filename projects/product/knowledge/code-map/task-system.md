# 任务系统的实现组织

这张地图回答：需求怎样进入任务协作，人在哪里参与决定，方案、实现、审查和收尾分别由谁负责。以下路径相对于 Buildr 产品根目录 `projects/product/`，只展开相关业务目录，止于文件层；职责以所列规范与当前实现为依据。

## 先理解职责怎样协作

**执行过程**：人讨论目标与约束 → 智能体（Agent）分流并选择独立位置 → 通过 OpenSpec 写方案、按需审查 → 在明确授权内实施、测试和审阅结果 → 完成交付与适用自举。Buildr 治理规则（Rule）、技能（Skill）及能力绑定，为智能体（Agent）提供工作基础；智能体（Agent）执行，具体能力保护自身写入。

**人机接续**：智能体（Agent）登记进展与明确事项 → Buildr Web 展示同一材料 → 人保存意见 → 智能体（Agent）重读答复和成果后继续。已有授权持续有效，网页保存答复不自动启动执行。

| 职责 | 当前实现与边界 |
| --- | --- |
| 规范依据 | [任务工作方式](../../openspec/specs/agent-task-workflows/spec.md)约束分流与隔离；[任务记录](../../openspec/specs/task-record/spec.md)约束目标、关系和结果；[工作摘要](../../openspec/specs/task-work-context/spec.md)约束进展、事项及答复。 |
| 工作基础 | Buildr 管理工作空间（Workspace）、项目与服务；治理规则（Rule）、技能（Skill）和能力绑定并投射给智能体（Agent），把方法、执行现场与用户可见入口连接起来。 |
| 接口入口（Interface） | 命令行（CLI）与超文本传输协议（HTTP）入口接收明确动作和已观察版本，调用同一应用；指令生成不代表执行。 |
| 应用服务（Application） | 任务应用维护目标与结果；工作摘要（Work Context）应用维护人机接续；审查与验证分别保存真实专业结论。应用不代替人作授权决定。 |
| 领域模型（Domain） | 表达四态、父任务完成依据、摘要与事项、审查及验证报告的数据结构；任务记录的输入、关系和完成规则由应用负责。 |
| 数据访问与技术支撑 | 本机 SQLite 保存独立当前事实；事务内比较各自摘要。工作树（Worktree）与预览（Preview）分别核验自身资源，Git 和文件继续持有实际成果。 |
| 前端协作 | 工作台（Workbench）汇集明确关注事项；任务详情呈现目标、进展和成果；表单保留真实用户输入，冲突后重读；方案材料与代码按需并排查看。 |

## 原型阅读怎样落到实现？

任务关联变更负责确定允许读取的成果范围；OpenSpec 查询发现带标记的 HTML，`prototype-metadata.ts` 有界解析可选页面、状态和纯文本说明，非法说明仅产生局部提示。`TaskNodeContent.tsx` 把关键页面直接列入方案菜单，`PrototypeTab.tsx` 组合隔离画面与说明；`PrototypeReaderPage.tsx` 提供任务限定的独立三栏阅读。原型不能获得真实写入能力，消息仅同步已声明阅读位置，并校验当前画面来源和装载标识。

实施清单与功能说明共同使用 `SideReadingPanel.tsx` 和 `useSideReading.ts`，复用悬停、固定及键盘退出。`PrototypeFeatureNotes.tsx` 仅适配 React 生命周期，卡片、区域高亮与消息联动的共同来源为 `services/buildr/resources/workspace/skills/buildr/ui-prototype/assets/feature-notes.js` 和配套样式，随原型技能分发；原型侧 `src/prototypes/prototype-bridge.ts` 复用同一来源。关联服务的正式和模拟入口共同使用 `ProjectServicesView.tsx`，操作由各入口接入。候选总览目前仅在本次模拟入口中运行，真实登记读取与工作空间入口仍待接入。

## 父任务协调怎样落到实现？

[父任务协调文章](../docs/flows/task-parent-coordination.md)解释整体目标与独立成果的关系，[完成时序图](../archify/flows/task-parent-coordination.html)展示核对、授权、写入与拒绝分支。实现复用本地图的任务查询、写入和存储，不维护另一份父子状态。

- **读取成果**：任务查询 → 父任务协调应用 → 任务详情中的 `ParentCoordinationPanel.tsx`。查询从当前父任务及直接子任务计算 `recordDigest` 与 `snapshotIdentity`；详情展示总体目标，面板展示各子任务结果和已保存的完成依据，不按子任务数量推断整体完成。
- **明确完成**：`useTaskActions.ts` 打开表单时重读协调结果；`ParentCompletionFields.tsx` 收集总体验收、逐个子任务处置及确认；`parentCoordination.ts` 把这些输入与已观察身份组成请求。任务写入应用在同一事务内核对任务版本、父子观察身份、子任务终态和处置完整性，成功后只保存这个父任务的结果与授权依据。
- **处理冲突**：目标、关系或结果已变化时，后端拒绝陈旧输入；`useTaskActions.ts` 关闭旧完成表单、清除旧确认并重读。智能体（Agent）或人据当前成果重新判断；软件不替用户补造授权，也不自动结束其他任务。
- **保存答复**：工作摘要（Work Context）应用按自身版本保存事项答复，不调用任务完成写入。答复可以供智能体（Agent）继续判断，但不自动完成任务；若答复包含具体完成授权，仍须核对当前目标与成果，再调用有版本保护的完成动作。

## 规范与实现在哪里？

与「知识建设与维护」采用同一阅读方式：加粗目录标明业务组织层，默认先看到职责；点击目录或左侧引导线继续展开。文件后的说明用于理解该文件，再按需阅读原文。

- `./` — Buildr 产品根
  - `openspec/` — 行为承诺与变更材料
    - **`specs/agent-task-workflows/`** — 从意图到专业执行的工作方式
      - [spec.md](../../openspec/specs/agent-task-workflows/spec.md) — 分流、默认隔离、OpenSpec 与按需协作
    - **`specs/task-record/`** — 任务核心事实
      - [spec.md](../../openspec/specs/task-record/spec.md) — 目标、范围、关系、四态与完成依据
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
      - [task.ts](../../services/buildr/src/modules/task/domain/task.ts) — 任务、结果、父任务完成依据与更正历史的数据类；不执行完成校验
      - [task-review.ts](../../services/buildr/src/modules/task/domain/task-review.ts) — 被审对象、审阅范围与结论
      - [task-verification.ts](../../services/buildr/src/modules/task/domain/task-verification.ts) — 验证报告及结论约束
    - `persistence/` — 独立事实的保存
      - [task-repository.ts](../../services/buildr/src/modules/task/persistence/task-repository.ts) — 任务主表、父身份和直接父关系；将完成依据随结果保存，子关系从当前记录反向读取
      - [task-review-repository.ts](../../services/buildr/src/modules/task/persistence/task-review-repository.ts) — 两类审查槽的摘要比较与保存
      - [task-verification-repository.ts](../../services/buildr/src/modules/task/persistence/task-verification-repository.ts) — 当前验证报告的原子替换
    - **`work-context/`** — 进展、待决事项与人的答复
      - [application/work-context-application.ts](../../services/buildr/src/modules/task/work-context/application/work-context-application.ts) — 按摘要版本登记进展、保留或替换事项、保存答复；不改任务状态或代替完成授权校验
      - [domain/work-context.ts](../../services/buildr/src/modules/task/work-context/domain/work-context.ts) — 摘要、事项身份、状态和输入约束
      - [persistence/work-context-repository.ts](../../services/buildr/src/modules/task/work-context/persistence/work-context-repository.ts) — 独立版本保护与待处理查询
      - [interfaces/http/work-context-http.ts](../../services/buildr/src/modules/task/work-context/interfaces/http/work-context-http.ts) — 网页读取、记录与回应
      - [interfaces/cli/work-context-cli.ts](../../services/buildr/src/modules/task/work-context/interfaces/cli/work-context-cli.ts) — 智能体（Agent）读取和记录同一摘要
    - `infrastructure/` — Git 位置与删除安全
      - [git-worktree-provider.ts](../../services/buildr/src/modules/task/infrastructure/git-worktree-provider.ts) — 创建和检查真实位置，清理前复核归属与成果保留
    - [module.ts](../../services/buildr/src/modules/task/module.ts) — 装配各独立能力及公开接口
  - **`services/buildr/src/modules/workbench/`** — 日常关注的组合阅读
    - [application/workbench-application.ts](../../services/buildr/src/modules/workbench/application/workbench-application.ts) — 读取明确事项、任务和已有每日演进，不推断任务正在执行
    - [application/preferences-application.ts](../../services/buildr/src/modules/workbench/application/preferences-application.ts) — 单独维护置顶、接下来和资料偏好
  - **`services/buildr/src/infrastructure/sqlite/`** — 通用存储安全
    - [workspace-sqlite.ts](../../services/buildr/src/infrastructure/sqlite/workspace-sqlite.ts) — 真实工作空间（Workspace）和合法写入来源
    - [transaction.ts](../../services/buildr/src/infrastructure/sqlite/transaction.ts) — 原子提交与失败回滚
  - **`services/buildr/src/web/application/`** — 临时预览资源
    - [preview-lifecycle.ts](../../services/buildr/src/web/application/preview-lifecycle.ts) — 核对实例与进程所有者，独立创建和停止预览（Preview）
  - **`services/buildr/src/modules/openspec/application/`** — 变更文件发现与说明读取
    - [prototype-metadata.ts](../../services/buildr/src/modules/openspec/application/prototype-metadata.ts) — 有界解析 HTML 内可选说明，不新增独立状态
  - `services/buildr-web/src/` — 前端协作
    - **`components/`** — 共用侧边阅读
      - [SideReadingPanel.tsx](../../services/buildr-web/src/components/SideReadingPanel.tsx) — 说明与实施清单共用的容器
      - [useSideReading.ts](../../services/buildr-web/src/components/useSideReading.ts) — 悬停、固定、关闭与宽度限制
    - **`features/project/components/`** — 项目界面的共同来源
      - [ProjectServicesView.tsx](../../services/buildr-web/src/features/project/components/ProjectServicesView.tsx) — 过滤、单选即关联及失败反馈，由入口注入操作
    - **`features/task/`** — 当前任务与接续
      - `pages/`
        - [PrototypeReaderPage.tsx](../../services/buildr-web/src/features/task/pages/PrototypeReaderPage.tsx) — 任务限定的独立三栏阅读
        - [TaskDetailPage.tsx](../../services/buildr-web/src/features/task/pages/TaskDetailPage.tsx) — 目标、摘要、成果、关系与专业结果
      - `components/`
        - [TaskNodeContent.tsx](../../services/buildr-web/src/features/task/components/TaskNodeContent.tsx) — 任务材料与原型页面的左侧目录
        - [PrototypeTab.tsx](../../services/buildr-web/src/features/task/components/PrototypeTab.tsx) — 隔离预览、说明、状态选择与阅读消息校验
        - [TaskAgentAction.tsx](../../services/buildr-web/src/features/task/components/TaskAgentAction.tsx) — 开始与继续工作的指令，按当前范围重新读取
        - [TaskWorkContextCard.tsx](../../services/buildr-web/src/features/task/components/TaskWorkContextCard.tsx) — 人查看与回应事项，冲突保留输入
        - [TaskArtifactReader.tsx](../../services/buildr-web/src/features/task/components/TaskArtifactReader.tsx) — 并排阅读真实方案和成果材料
        - [TaskCompleteModal.tsx](../../services/buildr-web/src/features/task/components/TaskCompleteModal.tsx) — 完成摘要与父任务明确授权
        - [ParentCoordinationPanel.tsx](../../services/buildr-web/src/features/task/components/ParentCoordinationPanel.tsx) — 展示直接子任务结果、父任务完成依据和局部历史诊断
        - [ParentCompletionFields.tsx](../../services/buildr-web/src/features/task/components/ParentCompletionFields.tsx) — 收集总体验收、逐子任务处置与明确确认；编辑内容后取消旧确认
        - [parentCoordination.ts](../../services/buildr-web/src/features/task/components/parentCoordination.ts) — 检查表单必填项、未结束子任务和明确确认，携带已观察身份生成完成输入
      - [hooks/useTaskActions.ts](../../services/buildr-web/src/features/task/hooks/useTaskActions.ts) — 完成前重读、提交版本与授权；冲突后清除旧确认、刷新成果，等待重新判断
      - [hooks/useTaskWorkContext.ts](../../services/buildr-web/src/features/task/hooks/useTaskWorkContext.ts) — 刷新与取消旧请求，防止不同任务内容混入
    - **`features/workbench/`** — 日常关注入口
      - [pages/WorkbenchPage.tsx](../../services/buildr-web/src/features/workbench/pages/WorkbenchPage.tsx) — 等我回应（明确的决定、验收或补充信息请求）、继续推进、项目变化与常用资料；没有回应请求时紧凑展示

## 哪些专业方法指导执行？

点击技能（Skill）名称查看方法。这里说明它指导谁做什么，不把技能（Skill）串成软件自动执行的状态机。

| 技能（Skill） | 职责 |
| --- | --- |
| [任务分流（task-triage）](../../services/buildr/resources/workspace/skills/buildr/task-triage/SKILL.md) | 核对需求、范围与授权，判断语义影响并选择实际工作位置 |
| [规范建设（OpenSpec）](../../services/buildr/resources/workspace/skills/openspec/openspec-propose/SKILL.md) | 指导智能体（Agent）写方案与行为承诺，按授权接续实施和适用归档 |
| [任务管理（task-manager）](../../services/buildr/resources/workspace/skills/buildr/task-manager/SKILL.md) | 维护任务、工作摘要（Work Context）、真实答复及父任务完成依据 |
| [工作树管理（task-worktree）](../../services/buildr/resources/workspace/skills/buildr/task-worktree/SKILL.md) | 创建、检查和安全清理明确归属的独立位置 |
| [任务审查（task-review）](../../services/buildr/resources/workspace/skills/buildr/task-review/SKILL.md) | 按目标与风险审查方案或实现结果，保存真实结论 |
| [任务验证（task-verification）](../../services/buildr/resources/workspace/skills/buildr/task-verification/SKILL.md) | 直接运行项目检查，区分检查通过、未覆盖与完成报告 |
| [收尾与交付（task-finish）](../../services/buildr/resources/workspace/skills/buildr/task-finish/SKILL.md) | 核验成果、完成实际交付，保存已有任务结果并处理安全善后 |
| [当前知识维护（current-knowledge-maintenance）](../../services/buildr/resources/workspace/skills/buildr/current-knowledge-maintenance/SKILL.md) | 维护受影响的文章、技术图（Technical Diagram）与代码地图（Code Map） |

自举激活由工作空间级 `buildr-self-bootstrap-sync` 唯一执行器承担；其技能（Skill）和两个脚本可从[自举图的来源](../archify/flows/task-self-bootstrap.html)读取。它按已交付范围执行同步、同步结果提交、应用更新和最终核验，不拥有任务完成状态。

## 成果保存在什么地方？

- `knowledge/` — 本主题可独立维护的成果
  - [index.yml](../index.yml) — 阅读身份、来源关联与文件说明
  - `docs/architecture/`
    - [task-system.md](../docs/architecture/task-system.md) — 精简架构主文
  - `docs/flows/`
    - [task-parent-coordination.md](../docs/flows/task-parent-coordination.md) — 父任务职责、日常协调、总体验收与冲突处理
  - `code-map/`
    - [task-system.md](task-system.md) — 规范、职责与实现地图
  - `archify/flows/`
    - [task-system.json](../archify/flows/task-system.json) — 完整过程与角色职责图源
    - [task-system.html](../archify/flows/task-system.html) — 总图展示
    - [task-system-planning.html](../archify/flows/task-system-planning.html) — 需求、方案与授权时序
    - [task-system-delivery.html](../archify/flows/task-system-delivery.html) — 实现审查与交付时序
    - [task-self-bootstrap.html](../archify/flows/task-self-bootstrap.html) — 自举与安全善后时序
    - [task-system.md](../archify/flows/task-system.md) — 逐项依据、分段图源和当前表述差异
    - [task-parent-coordination.json](../archify/flows/task-parent-coordination.json) — 父任务完成时序图源
    - [task-parent-coordination.html](../archify/flows/task-parent-coordination.html) — 核对成果、明确授权、保存完成与拒绝分支
    - [task-parent-coordination.md](../archify/flows/task-parent-coordination.md) — 父任务完成时序的规范与实现依据

地图按职责定位文件，源码内容由当前文件提供；没有改变的实现不因改写地图重新验证。实际存储与交互的代表检查见[任务记录回归](../../services/buildr/test/system/task-record-product.test.ts)、[父任务完成输入回归](../../services/buildr-web/test/parentCoordination.test.mjs)和[工作摘要与工作台回归](../../services/buildr/test/integration/workbench-application.test.ts)。
