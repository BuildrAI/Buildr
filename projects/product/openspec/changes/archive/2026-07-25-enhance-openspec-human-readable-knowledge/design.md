## Context

Buildr 当前以 OpenSpec 1.6.0 的 `proposal.md`、`design.md`、`specs/**/spec.md` 和 `tasks.md` 管理可实施变更。它们分别擅长解释动机、技术决策、规范行为和执行清单，但 Change 详情页只是逐段展示原始 artifact，普通用户需要自行拼接才能理解一次变更的完整故事。

Project 的当前事实目前集中在 `openspec/knowledge/buildr-current-state.md`。该文件已经确立 knowledge 不是规范来源、archive 不是当前事实源的边界，但单文件无法稳定承载产品架构、技术架构、跨模块流程、Service 责任和术语。现有工作流也没有在 Change 生命周期中判断“哪些当前认知受到影响、何时更新、如何证明已对齐”的通用机制。

Buildr 已有 capability contract、workspace provider、consumer dependency、runtime binding evidence 和 Component Skill Contribution。外部 OpenSpec Skills 由上游持续更新，Buildr 不应直接编辑其正文，也不应让外部 Skill 按固定 Skill id 调用 Buildr 自有实现。

本变更涉及 Product OpenSpec、workspace Skills/Component、Buildr Service read model 与本机应用，属于跨模块架构变更。

## Goals / Non-Goals

**Goals:**

- 让人能先通过一份稳定、短而完整的 Change Brief 理解变更，再按需要深入标准 OpenSpec artifacts。
- 建立可逐步生长的 Project 当前认知结构，只在存在真实事实和真实影响时创建或更新文档。
- 统一人与 Agent 使用的项目术语，明确 Context 与 Context Window 等易混淆概念。
- 用两个可替换 capability contracts 连接外部 OpenSpec workflow 与 Buildr 自有专业动作，同时保持上游 Skill 源可独立升级。
- 在最终验证前收敛 specs、实现、Brief 和当前认知；归档只移动已经对齐的结果。
- 让 Change read model 和本机应用同时支持 active 与 archived Brief，不建立新的持久化 Change 状态。

**Non-Goals:**

- 不改变 OpenSpec 1.6.0 自有 artifact schema、CLI 或上游 Skills。
- 不把 Brief、knowledge 或 glossary 变成 specs 的替代事实源。
- 不在 v1 建立 Organization/global glossary，也不为每个 Task 建立独立术语表。
- 不引入 daemon、hook、事件总线或自动从代码生成文档的后台系统。
- 不要求每个 Project 预先生成完整目录或空模板，也不承诺一次 Change 补齐全部历史知识债务。
- 不把用户故事设为所有 Change 的强制表达；当角色和目标有助于理解时使用用户故事，跨角色或跨系统行为优先使用核心流程。

## Decisions

### 1. `brief.md` 是 Buildr companion artifact，不扩展 OpenSpec schema

每个正式 Change 在 proposal 阶段由 Buildr contribution 要求创建同级 `brief.md`。Brief 使用稳定章节组织：一句话摘要、背景与问题、目标/非目标、受影响用户与角色、核心流程（必要时表达 before/after）、关键变化、影响/风险/兼容性、验收摘要和技术 artifacts 链接。

Brief 的权威关系为：

- proposal 决定 why 与 scope；
- design 决定技术取舍；
- specs 决定规范行为；
- tasks、实现和 evidence 决定执行状态；
- brief 只重组以上内容，提供面向人的整体理解。

若 Brief 出现标准 artifacts 不支持的新行为，Agent 必须先修改对应 proposal/design/spec，而不是把 Brief 保留为第二套约定。Brief 随 Change 原目录一起归档，成为稳定历史阅读入口；OpenSpec CLI 可以忽略该 companion 文件。

采用 companion 文件而不是修改 OpenSpec schema，是因为 OpenSpec 1.6.0 的标准 artifacts 已形成明确契约，Buildr 只需要增加产品层投影。备选方案是在 Local App 动态拼接 proposal/design/specs，但它无法形成可审阅、可归档、可被其他 Agent 直接读取的稳定资产。

### 2. 当前认知按信息职责拆分，产品架构与技术架构分开维护

Project 使用以下约定位置；目录和文件在首次出现真实内容时创建：

```text
openspec/knowledge/
  overview.md
  glossary.md
  architecture/
    index.md
    product.md
    technical.md
  flows/<flow-id>.md
  services/<service-code>.md
```

- `overview.md`：项目定位、用户、核心能力和当前认知入口。
- `architecture/index.md`：面向人的架构摘要及产品/技术架构导航。
- `architecture/product.md`：用户、角色、业务能力、领域模块、产品边界和信息架构。
- `architecture/technical.md`：系统/Service/模块、数据所有权、接口依赖、runtime、部署和安全边界。
- `flows/<flow-id>.md`：跨角色、模块或 Service 的核心流程、关键状态和异常路径。
- `services/<service-code>.md`：Service 职责、API/事件、数据、依赖、配置和运行要求；Service 局部术语在该文件的术语小节表达。
- `glossary.md`：Project canonical glossary。

产品架构和技术架构分开，是因为阅读者、变化原因和维护频率不同；`architecture/index.md` 负责把两者重新组织为统一入口。核心流程单独维护，是因为流程通常横跨产品与技术视角，把它复制到两份架构文档会造成漂移。

现有 `buildr-current-state.md` 中的真实事实按目标结构迁移；无法确认归属或仍在演进的内容不机械复制。`task-boards/` 和既有 `task-cockpits/` 保持原位和原职责。

### 3. Specs 与实现是当前行为权威，knowledge 是当前事实解释层

当前认知维护按以下优先级核对来源：

1. canonical specs；
2. 当前实现、registries 和受管 manifests；
3. active Change 的 proposal/design/specs/tasks；
4. 已确认对话与验证 evidence；
5. archived Changes 仅作为来源线索和历史理由。

knowledge 不能覆盖规范行为，也不能因为历史归档存在就继续陈述已经失效的事实。发生冲突时先修正权威资产，再更新知识表达。Brief 属于 Change 叙事；knowledge 属于 Project 当前事实，两者不会互相替代。

### 4. 术语采用 Project canonical、Service 局部补充的两级模型

`openspec/knowledge/glossary.md` 是 Project 默认术语权威。每个条目至少包含 canonical 中文/英文（适用时）、定义、适用范围、避免使用的歧义表达和来源链接。Service 特有术语可放在 `services/<service-code>.md` 的术语小节，但不得静默重定义 Project term；确有范围差异时必须显式限定。

Task 不建立独立 glossary。Task 发现的新词先作为待确认信号，只有语义已确认且属于长期项目事实时才进入 Project 或 Service 术语。Buildr 的 Workspace、Project、Service、Context、Task Context 和 Context Window 等产品级概念由 Buildr Product Project glossary 维护。v1 不做跨 Project 自动继承，以免在缺少组织治理模型时形成隐式全局语义。

### 5. 用四层模型区分工作信息、受治理资产、Task Context 和 Context Window

本变更将工作相关信息组织为四层：

1. Work Information Space（工作信息空间）：所有潜在可用于工作的来源，包括 Workspace 文件、数据库、API、网页、聊天、机器状态、用户输入和工具结果；它不是 Buildr 管理范围的同义词。
2. Workspace、Work Assets 与 Shared Work Environment：Workspace 是工作范围和发现入口，其中可以包含代码、文档、临时文件、依赖和本机配置；只有被明确组织、登记或纳入治理的长期工作事实与工作方法才是 Work Assets，Buildr 将这些资产和入口组织、投射成 Shared Work Environment。
3. Task Context（任务上下文）：Agent 为完成具体 Task，从工作信息空间中发现、检索、判断、选择、组织和压缩后实际使用的语义工作集。它可来自 Buildr Work Assets，也可来自数据库、API、网页、用户输入和任务过程 evidence。
4. Context Window（上下文窗口）：某一次模型调用实际装入的有限、临时输入，是 Task Context 在某一时刻的有限投影，也会包含系统指令或对话历史等运行输入；它不是 Task Context 本身。

Context 是范围化的候选信息概念；Work Context、Workspace Context、Project Context 和 Service Context 只作为 Context 的范围限定使用，不需要在 v1 各自建立并列核心术语。文件位于 Buildr Workspace 只表示它处于可发现范围，不自动表示它是受治理 Work Asset；Task 使用 Buildr 资产也不表示 Task 的理解、检索、推理和执行由 Buildr 接管。

这样保留 Buildr 建设长期资产基础与共享工作环境、Agent 形成 Task Context 的责任边界，同时允许 `rg`/`grep`、直接文件读取、SQL/数据库连接、API、语义检索、MCP 和 registry/routing 等不同发现方式。具体检索工具不是 Buildr 产品模型的一部分。

### 6. 术语治理作为独立可替换能力

新增 `buildr.terminology-governance/v1` contract 和默认 `terminology-governance` provider。contract 只规定 consumer 真正依赖的保证：解析 Project、定位 canonical glossary、检查已有定义、识别同义词/一词多义/中英不一致/作用域冲突、先调查可从资产确认的事实、只对长期语义与责任边界决策追问、只写入已确认术语，并返回结构化 evidence。

结果至少包含 `status`（`aligned`、`updated`、`unresolved`、`not-applicable`）、`termsConsulted`、`canonicalTerms`、`changedAssets`、`unresolvedConflicts` 和来源 identities。不可逆或跨边界的术语选择可以建议进入 design/ADR，但 contract 不强制固定访谈脚本、固定命令或固定 provider identity。

### 7. 当前认知维护能力负责生命周期编排

新增 `buildr.current-knowledge-maintenance/v1` contract 和默认 `current-knowledge-maintenance` provider；默认 provider required 依赖 `buildr.terminology-governance/v1`。它提供三个稳定动作：

- `assess`：在 propose/update 阶段识别 Brief、overview、product architecture、technical architecture、flows、services、glossary 的可能影响和理由。
- `reconcile`：在实现完成、最终验证前，按最终 specs、实现和 registries 创建或更新真正受影响的当前认知，并解决或披露术语冲突。
- `inspect`：在 Task Finish 中证明 assess 项已处理、当前认知与最终 tree 对齐且没有未解决术语；不满足时 fail closed。

Change 可包含 `.buildr/knowledge-impact.yml` sidecar，记录 schema version、change、动作、受影响类型、目标、理由、状态、来源 identity 和 unresolved items。它只保存工作流 evidence，不是事实源，并随 Change 归档。

影响分类规则为：

| 目标 | 触发事实 |
|---|---|
| Brief | 每个正式 Change；scope、流程、影响或验收变化时更新 |
| overview | 项目定位、用户、核心能力或全局入口变化 |
| product architecture | 角色、业务能力、领域模块、产品边界或信息架构变化 |
| technical architecture | Service 拓扑、模块边界、数据所有权、接口依赖、runtime、部署或安全变化 |
| flows | 用户旅程、业务状态、跨模块/Service 顺序或关键异常变化 |
| services | Service 职责、API/事件、数据、依赖、配置或运行要求变化 |
| glossary | 新增、重定义、重命名、歧义、中英不一致或所有权边界变化 |

普通内部重构若不改变这些事实，可以返回 `not-applicable`。Provider 不负责把所有文档补齐到理想状态，只负责当前 Change 的真实影响和发现的直接冲突。

### 8. 用 capability dependency 与 Component contribution 连接 OpenSpec 1.6.0

consumer 只依赖 contract，不依赖默认 provider id：

| Consumer | Dependency | 用途与降级 |
|---|---|---|
| `openspec-explore` | terminology optional | 有 provider 时主动对齐术语；缺失时仍可探索并标注未治理术语 |
| `openspec-propose` | current-knowledge required | 创建 Brief、运行 assess，并把真实影响变成 tasks |
| `openspec-update-change` | current-knowledge required | planning 修订后刷新 Brief 和影响评估 |
| `openspec-apply-change` | current-knowledge required | 执行知识维护任务，新增发现写回影响 evidence，并在实现末尾 reconcile |
| `openspec-sync-specs` | current-knowledge required | sync 前确认 reconcile evidence 对应当前 canonical 候选 |
| `task-finish` | current-knowledge required | 最终验证前 inspect；必要的 fallback reconcile 发生内容变化后必须重新验证 |
| `openspec-archive-change` | 无直接依赖 | 只归档已经同步、验证和知识对齐的 Change |

OpenSpec Component 向这些 external consumers 注入 Buildr sidebar/slot，runtime binding block 再向 Agent 提供 contract 与 selected provider 路径。外部 Skill 源文件不包含 Buildr Skill id 或调用逻辑；Component 卸载后 contribution 消失，external Skill 保持上游行为，required dependency 的 readiness 按现有 capability framework 诊断。

`task-finish` 在把 tree 交给 task-verification provider 前完成 inspect。若 inspect 只确认一致，复用既有流程；若 fallback reconcile 修改了 Brief、knowledge、spec 或其他 delivery content，则按 `implementation-changed` 使旧 evidence 失效并重新执行所需 assurance。归档后不再维护 glossary 或 knowledge。

### 9. Change read model 和页面使用同一 companion artifact

Change indexer 在已校验的 Change root 内按需读取 `brief.md`，返回 availability、content 和相对 source path；缺失时明确 unavailable，不生成内容。active 与 archived 使用同一安全读取规则。

Change 详情页按以下阅读顺序呈现：

1. identity、lifecycle、任务进度和更新时间；
2. Brief 的人类可读章节；
3. proposal、design、specs、tasks 等技术 artifacts 的可展开入口；
4. 继续/审阅 Agent actions。

旧 Change 没有 Brief 时，页面显示明确缺失状态并继续提供标准 artifacts，不阻止历史阅读。这样保持向后兼容，也不在 UI 运行时虚构 Brief。

## Risks / Trade-offs

- [Risk] Brief 与标准 artifacts 重复并发生漂移 → 通过 authority 规则、reconcile/inspect evidence 和最终验证前门禁阻止矛盾内容进入归档。
- [Risk] required dependency 让 OpenSpec workflow 在 provider 缺失时 blocked → 将默认 contracts/providers 与 OpenSpec Component 一起作为 Buildr baseline 交付，并让 doctor 提供确定性修复路径；只有 explore 允许 optional 降级。
- [Risk] 知识维护扩大每个 Change 的成本 → assess 允许 `not-applicable`，只创建/更新真实受影响文档，不要求补齐无关历史事实。
- [Risk] 单个 Change 同时触达多个 canonical specs → 使用现有 contract baseline 和 active-change conflict guard，delta 按 Requirement identity 管理。
- [Risk] 旧 Change 没有 Brief 或 impact sidecar → read model 明确缺失；只对新建或主动修订的 Change 执行新机制，不批量回写历史 archive。
- [Risk] Product 与 technical architecture 仍可能重复 → 用 index 负责导航、flows 负责跨视角过程，并在 provider 中按内容职责检查重复。
- [Risk] 项目术语与 Service 局部术语冲突 → Project glossary 优先，Service 必须显式声明作用域差异，无法解决时返回 `unresolved` 并阻塞收敛。

## Migration Plan

1. 增加三个 capability delta、新 contracts/providers 和 manifest/binding 定义，先通过 package/doctor 结构验证。
2. 扩展 OpenSpec Component contributions 和 external consumer dependency declarations，验证 install/update/sync/render 不修改上游 Skill 源。
3. 建立知识目录机制，并把 `buildr-current-state.md` 中可确认事实迁移到实际需要的 overview、architecture、flows、services 和 glossary；迁移完成前保留旧文件入口，确认引用后再移除或改为迁移说明。
4. 扩展 Change read model 与 Local App，兼容 Brief 缺失的旧 Change。
5. 为本 Change 自身补齐 Brief、knowledge impact、当前认知与术语，以自举方式验证 propose/apply/reconcile/inspect。
6. 运行 affected verification、OpenSpec strict、contract guard 和最终 Candidate；仅在最终 tree 对齐后同步 specs 并归档。

回滚时可移除新 consumer dependencies、Component contributions、providers/contracts 和 UI/read-model字段；已创建的 Markdown knowledge 与 archived Brief 保持为普通可读资产，不需要破坏性删除。旧 `buildr-current-state.md` 在迁移验证完成前作为兼容入口保留。

## Open Questions

当前没有阻塞创建或实现的开放问题。实现阶段若 OpenSpec 1.6.0 对 companion files 的校验或 archive 搬运行为与现有观察不一致，先以真实 CLI 结果修订设计，不扩展上游 artifact schema。
