## ADDED Requirements

### Requirement: 已有任务原型归属与发现
Buildr MUST 先证明请求的正式任务存在，再从该任务的已关联规范变更（OpenSpec Change）及主工作空间（Canonical Workspace）的 `.buildr/local/task-prototypes/<task-id>/` 读取原型。任务本机目录 MUST 只由已核对的任务编码推导；MUST 不依赖关联变更或工作树（Worktree）存在，MUST NOT 扫描其他任务、临时目录或整个工作空间（Workspace）。从主工作空间（Canonical Workspace）到原型目录及文件的每级路径 MUST 拒绝符号链接（Symbolic Link）；文件 MUST 复用既有发现标记、体积、深度和数量限制，以及离线隔离阅读约束。任务本机来源 MUST 与规范变更来源可区分，不得伪造项目、变更或变更生命周期（Change Lifecycle）。读取 MUST 不创建目录、文件、任务状态或关联登记。

#### Scenario: 无变更任务读取本机原型
- **WHEN** 正式任务存在且其本机目录含符合内容格式的原型，但任务没有关联变更或工作树（Worktree）
- **THEN** 列表与单页读取 MUST 返回该原型，并由 Buildr Web 的“方案设计”和“单独查看”使用同一内容及功能说明

#### Scenario: 严格限定当前任务
- **WHEN** 其他任务目录、临时目录或项目其他位置存在带发现标记的 HTML
- **THEN** 当前任务查询 MUST NOT 返回这些文件
- **AND** 不存在的任务 MUST NOT 因本机存在同名目录而获得原型读取入口

#### Scenario: 本机原型路径包含符号链接
- **WHEN** 任务本机原型路径的任一中间目录或 HTML 文件为符号链接（Symbolic Link）
- **THEN** Buildr MUST 拒绝读取该路径并返回局部诊断，MUST NOT 沿链接读取其他位置或阻止其他安全来源的原型

#### Scenario: 原有变更原型继续可读
- **WHEN** 任务已经从关联变更的真实工作副本或归档目录读取原型
- **THEN** 原有标识、文件发现、安全隔离和阅读交互 MUST 保持兼容，新本机来源不得覆盖或伪装成原变更来源

## MODIFIED Requirements

### Requirement: UI Prototype 必须经过浏览器验证并返回全部文件
技能（Skill）MUST 在浏览器中打开生成的每个 HTML 文件，并检查展示、核心交互、必要状态、当前说明和既有交互的一致性；尚无正式任务时 MUST 验证独立预览；已有正式任务时，无论是否关联规范变更（OpenSpec Change），MUST 验证实际任务阅读与单独查看；MUST 返回全部实际文件、来源观察及逐页验证范围。任何无法验证的交互或状态 MUST 明确列为边界。

#### Scenario: 多个原型页面验证成功
- **WHEN** 多个原型页面及其核心交互在浏览器中正常工作
- **THEN** 技能（Skill）MUST 返回全部原型文件及逐页验证摘要
- **AND** 后续设计师或智能体（Agent）MUST 能直接打开每个完整 HTML

#### Scenario: 浏览器验证不完整
- **WHEN** 浏览器能力、页面脚本或环境限制使部分页面或核心交互无法验证
- **THEN** 技能（Skill）MUST 报告未验证范围
- **AND** MUST NOT 将全部文件描述为已完整验证

#### Scenario: 有任务但没有规范变更
- **WHEN** 当前正式任务没有关联规范变更（OpenSpec Change），且原型已保存到任务本机目录
- **THEN** 智能体（Agent）MUST 在实际任务的“方案设计”和“单独查看”验证全部页面、核心交互与功能说明
- **AND** MUST NOT 用独立预览可打开替代任务内展示验证

### Requirement: UI Prototype 必须保持非规范且复用 Task Change 关联
界面原型（UI Prototype）MUST 只用于对齐完整页面与约束后续实现，MUST NOT 成为正式设计稿、权威规范（Canonical Spec）、规划身份（Planning Identity）、任务验证结果（Task Verification Result）或默认像素级验收标准。有适用关联规范变更（OpenSpec Change）时，原型 MUST 继续作为变更真实工作副本或归档目录内的普通 HTML 被任务范围读取模型（Task-scoped Read Model）发现。没有关联变更的正式任务 MUST 可以使用主工作空间（Canonical Workspace）的 `.buildr/local/task-prototypes/<task-id>/` 保全并展示原型；这个受限本机目录 MUST NOT 扩展为任意文件附件、任务状态或独立关系登记。Buildr MUST NOT 为原型新增任务记录（Task Record）字段、数据库状态或专用命令行（CLI）。

#### Scenario: Change 从 active 进入 archive
- **WHEN** 任务关联规范变更（OpenSpec Change）的工作副本从 `active` 收敛为 `archived`
- **THEN** Buildr MUST 继续从同一任务范围读取模型（Task-scoped Read Model）发现归档目录中的原型文件
- **AND** MUST NOT 要求迁移到第二原型存储

#### Scenario: Task 没有关联 Change
- **WHEN** 正式任务没有关联规范变更（OpenSpec Change）
- **THEN** Buildr Web MUST 展示任务本机目录中可发现的原型，目录不存在或没有可读原型时返回明确空态
- **AND** MUST NOT 为展示原型强造变更、扫描整个工作空间（Workspace）或创建隐式业务关联

### Requirement: 关键页面说明与源码来源可以独立接续
新生成的原型 MUST 提供关键页面、必要状态、本次变化、主要功能、操作结果及边界的对应说明，并保持当前画面和说明一致。项目已有统一原型阅读器时 MUST 复用其页面目录、状态选择和说明交互，MUST NOT 只复用卡片后另造说明外壳；没有现成阅读器时才按技能（Skill）示例组装。功能说明 MUST 复用技能（Skill）提供的组件（Component）、脚本与样式；独立预览在宽屏空间充足时 MUST 默认并排展开说明并允许折叠，窄屏 MUST 沿用统一阅读器的清晰入口和展开方式，避免初始遮住画面。任务阅读 MUST 使用宿主说明面板，不重复叠加独立面板。原型 MUST 记录可追溯的源码观察与已验证范围；自包含成果 MUST 能在离线安全隔离中独立展示，MUST NOT 依赖开发服务器、真实网络、父页面权限或浏览器持久存储。

#### Scenario: 说明随页面变化
- **WHEN** 用户从目录或原型交互进入另一已制作的关键页面或状态
- **THEN** 对应说明 MUST 与当前画面一致，重看指定画面 MUST 使用明确初始数据

#### Scenario: 交给后续智能体
- **WHEN** 后续智能体（Agent）读取本次演示成果
- **THEN** MUST 能确定覆盖的关键页面、来源观察、模拟边界和未验证项；成果 MUST 不替代正式行为规范

#### Scenario: 宽屏打开独立原型
- **WHEN** 用户直接打开新生成的自包含原型，且宽度足够并排阅读
- **THEN** 当前页面的功能说明 MUST 默认并排可见，折叠后 MUST 保留清晰的展开入口
- **AND** 说明悬停、聚焦及定位 MUST 使用同一说明组件（Component）及样式，不重置模拟数据

#### Scenario: 窄屏打开独立原型
- **WHEN** 用户直接打开新生成的自包含原型，且宽度不足以并排阅读
- **THEN** 页面 MUST 保留清晰的“功能说明”入口，按统一阅读器的既有方式展开和关闭
- **AND** MUST NOT 为默认展开说明而初始遮住原型画面

#### Scenario: 在任务中查看原型
- **WHEN** 同一原型由 Buildr Web 任务阅读器加载
- **THEN** 原型 MUST 通过既有消息协议（Message Protocol）与宿主说明联动，MUST NOT 重复显示独立说明面板

### Requirement: 原型成果必须随实施决定可靠接续
原型技能（Skill）MUST 负责临时保存、归入任务及清理；入口技能（Skill）MUST 在用户决定实施且已有原型时接续该职责，MUST NOT 将接续已有成果当作生成新原型而重复索取授权。保存位置 MUST 根据是否已有正式任务及其关联变更确定，MUST NOT 等待实施决定。已有任务时，生成后或后续建立任务时 MUST 立即保全当前版本并验证任务内展示；有适用关联规范变更（OpenSpec Change）时使用其真实工作副本，否则使用主工作空间（Canonical Workspace）的 `.buildr/local/task-prototypes/<task-id>/`。归入供评审 MUST 仍为 `generated`，MUST NOT 推断采用、实施授权或验收通过。尚无任务且未指定位置时 MUST 使用实际系统临时目录内独立子目录保存预览，MUST NOT 为预览强造任务或变更。决定实施后 MUST 在正式前端编辑前核对并复用已确认版本，补齐缺失接续与引用，MUST NOT 以新生成内容冒充已确认版本。

#### Scenario: 先看原型再决定
- **WHEN** 用户明确要求看原型，尚无正式任务且没有指定保存位置
- **THEN** 智能体（Agent）MUST 可以直接生成临时预览，报告实际路径及临时保留性质，不要求先创建任务或变更

#### Scenario: 已有任务直接归入供评审
- **WHEN** 用户要求生成或修改原型，当前已有正式任务但尚未批准实施
- **THEN** 智能体（Agent）MUST 按当前关联保存原型、更新已有成果引用并验证任务内及单独查看，MUST NOT 只提供临时预览
- **AND** 原型存在或归入任务 MUST NOT 被当作批准实施

#### Scenario: 临时原型后续建立正式任务
- **WHEN** 先前无任务讨论已生成临时原型，后续创建或明确关联正式任务
- **THEN** 智能体（Agent）MUST 立即核对并归入任务，MUST NOT 等待用户批准正式功能实施

#### Scenario: 决定按已有原型实施
- **WHEN** 用户决定实施且已有讨论阶段原型
- **THEN** 智能体（Agent）MUST 核对确认版本，复用已保全副本或补齐归入、任务阅读验证及引用，再接续正式前端编辑
- **AND** MUST 在新副本完整可读前保留原件，不把归入推迟至收尾

#### Scenario: 不需要变更的实施
- **WHEN** 用户决定实施但按实际语义不需要规范变更（OpenSpec Change）
- **THEN** 智能体（Agent）MUST 保全任务本机原型并验证实际任务阅读，MUST NOT 为展示而强造变更

#### Scenario: 后续关联规范变更
- **WHEN** 正式任务的原型原先保存在本机目录，后续建立适用关联规范变更（OpenSpec Change）
- **THEN** 智能体（Agent）MUST 先保全当前版本到变更真实工作副本、验证任务展示并更新引用，然后清理已被替代且无需保留的本机副本
- **AND** MUST NOT 维持两份独立更新的原型或伪造历史确认

#### Scenario: 临时文件已丢失
- **WHEN** 接续时发现临时文件已被清除
- **THEN** 智能体（Agent）MUST 报告缺失并核对可恢复来源，重建内容不得冒充原确认版，不阻止无关安全工作
