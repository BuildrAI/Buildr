## MODIFIED Requirements

### Requirement: Task详情必须直接展示Task Record与独立专业事实
Buildr Web MUST在任务详情直接展示Task Record目标、状态及默认任务需求正文；结果在收尾节点展示，Change、父子关系和复盘在对应阅读入口展示。Review与Verification MUST独立读取并在所选节点直接呈现完整结果，父任务协调只在适用Task显示。页面 MUST不请求Task Overview、组合统一推进状态或根据专业结果推断Task能否完成。

#### Scenario: 普通Task没有专业结果
- **WHEN** Task只有Task Record且没有Review或Verification
- **THEN** 任务详情 MUST正常显示目标，已有结果仍可在收尾节点读取
- **AND** 专业结果缺失 MUST不形成Task错误或全局阻塞

#### Scenario: 专业读取失败
- **WHEN** Review、Verification或父任务协调中的一个读取失败
- **THEN** 页面 MUST只在对应区域显示局部错误
- **AND** Task Record及其他已读取事实 MUST继续可见
### Requirement: Buildr Web Task 详情必须提供 UI Prototype 视图
Buildr Web Task 详情 MUST 在方案设计节点提供实际已有“原型”的文档切换项，按需读取当前 Task 关联 Change 中可发现的一个或多个 UI Prototype 页面，并 MUST 允许用户在页面列表中选择和操作当前页面。页面 MUST 同时说明 UI Prototype 是实现参考而非正式设计、canonical spec 或像素级验收标准。当当前页面可在舞台中展示时，原型舞台 MUST 提供「新窗口打开」控件，并用新窗口打开该页面同一 Task-scoped 内容 URL。

#### Scenario: Task 存在多个原型页面
- **WHEN** 只读 API 返回两个或以上 UI Prototype 页面
- **THEN** 原型视图 MUST 展示全部页面的标题、关联 Change 与 portable 相对路径
- **AND** 用户选择任一页面后 MUST 在同一 Task 详情中看到对应完整可交互页面

#### Scenario: Task 没有可发现原型
- **WHEN** Task 没有关联 Change、Change 暂不可用或关联 Change 中没有带新标记的 HTML
- **THEN** 对应节点 MUST 展示必要的空态或诊断
- **AND** MUST NOT 改变 Task 状态或隐藏其他详情视图

#### Scenario: 用新窗口打开当前原型页面
- **WHEN** 原型舞台正在展示当前选中页面
- **THEN** 舞台 MUST 提供「新窗口打开」控件
- **AND** 激活后 MUST 用新窗口打开 iframe 正在使用的同一 Task-scoped 内容 URL
- **AND** MUST NOT 把原型 HTML 注入 Buildr Web 父页面 DOM

### Requirement: Task Intent 必须支持可点击的 Project 文档引用
Buildr Web MUST 以受限 Markdown 展示 Task Intent，并 MUST 允许用户点击指向当前 Task scope 内已登记 Project 的 Workspace 相对 `.md` 路径，在 Task 上下文中打开只读文档预览。客户端 MUST 根据 Project registry 的真实 source path 解析引用并复用任务范围文档接口选择当前工作树或保留项目根；MUST NOT 从目录命名猜测 Project、读取绝对路径或获得任意 Workspace 文件访问能力。

#### Scenario: 查看任务引用的架构文档
- **WHEN** Task Intent 包含一个带用户可读名称、且路径位于 Task scope 内已登记 Project 的 Markdown 链接
- **THEN** 页面 MUST 将名称显示为可点击链接
- **AND** 点击后 MUST 展示文档正文、文档名称和 Project 相对路径

#### Scenario: 文档引用不可用
- **WHEN** Intent 链接不是 `.md`、不属于 Task scope 内已登记 Project、文件缺失或路径越界
- **THEN** 页面 MUST 显示明确的不可用提示
- **AND** MUST NOT 扫描 Workspace、改写 Intent 或尝试读取其他路径

#### Scenario: 继续浏览同一 Project 内的 Markdown 文档
- **WHEN** 用户在 Task 文档预览中点击当前文档的相对 `.md` 链接
- **THEN** 页面 MUST 使用同一任务范围文档接口 打开解析后的 Project 内文档
- **AND** 越出 Project 或非 Markdown 的链接 MUST 被拒绝

#### Scenario: Intent 仍由 Task Record 管理
- **WHEN** 用户编辑或读取含 Markdown 文档引用的 Intent
- **THEN** Task Record MUST 继续只保存原有 intent 字符串并保持既有 optimistic concurrency 与搜索语义
- **AND** 系统 MUST NOT 新增附件状态、Planning gate 或第二 Task writer

### Requirement: Buildr Web 必须统一具名 Workspace 相对 Markdown 引用
Task、Project与Service页面 MUST使用共享解析规则处理带用户可读名称的Workspace相对`.md`引用，根据已登记Project `source.path`与页面scope解析到具名项目；Task使用任务范围文档接口，Project和Service使用各自文档接口，并分别表达“引用可解析”与“正文当前可读取”。页面 MUST NOT按目录约定猜测Project、读取绝对路径、扫描Workspace或因正文当前不可读而改写引用。

#### Scenario: 在Task中打开具名文档引用
- **WHEN** Task Intent包含位于Task scope已登记Project内的具名Workspace相对Markdown链接
- **THEN** 页面 MUST显示链接名称并在解析成功后标记引用scope
- **AND** 只有对应文档接口成功返回后才 MUST显示正文当前可读取

#### Scenario: Project或Service文档继续相对导航
- **WHEN** 用户在Project或Service文档正文中点击同一Project内的相对Markdown链接
- **THEN** 共享解析规则 MUST解析为规范化Workspace引用并继续通过同一Project Document API打开
- **AND** 越界、非Markdown或其他Project引用 MUST被拒绝

#### Scenario: 引用可解析但正文不可读取
- **WHEN** 引用语法与scope合法但文档缺失、不可读或API返回失败
- **THEN** 页面 MUST保留“引用已解析”事实并显示“正文当前不可读取”的局部提示
- **AND** MUST NOT将其升级为Task lifecycle失败、自动修复或任意文件读取

## ADDED Requirements

### Requirement: 任务详情必须按工作路径直接组织已有内容
默认页面 MUST在列表旁的现有副屏紧凑展示标题、编码、目标和状态，再以紧凑标签连接任务需求、方案设计、开发实现和任务收尾；方案审查 MUST在方案设计内，实现审查和开发验证 MUST在开发实现内，用户确认 MUST在任务收尾内。默认 MUST选中任务需求并直接显示正文，切换节点 MUST直接显示对应文档或完整结果，多份材料 MUST在同层切换，不经过文件入口或资料目录中转。

#### Scenario: 读取完整任务
- **WHEN** Task拥有 brief.md、proposal.md、design.md、tasks.md、规范文件及专业结果
- **THEN** 需求节点 MUST直接预览 brief，设计节点 MUST默认显示 proposal 正文并可切换 design/specs，实施清单 MUST在全局侧栏直接显示，实施节点 MUST显示实现审查与开发验证摘要，设计与实现内部的审查 MUST默认显示最新结论并可切换历次记录，开发实现内的验证 MUST直接展示当前结果及检查依据，收尾 MUST集中使用用户确认及交付记录
- **AND** 多个关联变更 MUST标识材料来源，原始正文保持其自身权威

#### Scenario: 简单任务与空内容
- **WHEN** Task没有方案材料或部分节点没有记录
- **THEN** 页面 MUST保持四个主节点并如实显示空内容；MUST NOT强制创建文档、报告、子任务或错误状态
- **AND** brief缺失 MUST显示暂无补充需求或说明，任务目标仍可读

#### Scenario: 当前工作与阅读选择不同
- **WHEN** 智能体记录 implementation 表示验证失败后的修复，而用户在方案设计内选择方案审查
- **THEN** 页面 MUST同时保留实现处的当前标记与方案设计及其内部方案审查的阅读选中态，显示保存的失败结果与当前实现标记
- **AND** 没有明确 stage 时 MUST不标记当前节点；MUST NOT从文件存在、清单数量或 active 状态推断当前节点、自动执行或通过

### Requirement: 任务详情阅读与数据维护必须遵循统一交互
任务列表点击任务 MUST通过现有系统分屏在副屏展示任务详情，主屏列表、筛选与滚动 MUST保持。节点文档、用户答复与收尾 MUST在该详情内直接显示；引用文档 MUST复用现有抽屉阅读；审查与验证 MUST在节点目录右侧阅读，实施清单 MUST在全局侧栏直接显示，不创建第三分屏或嵌套分屏。维护任务、进展和答复 MUST使用统一抽屉。关闭任务副屏 MUST恢复原列表，深链 MUST仍可定位该任务；页面 MUST复用现有主题、控件与窄屏阅读规则。

#### Scenario: 阅读过程中维护
- **WHEN** 用户在任务副屏直接阅读方案后，在抽屉修改任务或记录答复并保存或取消
- **THEN** 抽屉 MUST关闭并保留阅读上下文，保存后刷新相关事实；取消不得改变原内容

#### Scenario: 并发冲突
- **WHEN** 用户基于旧摘要或事项身份保存
- **THEN** 抽屉 MUST保留输入并提供重读与核对；MUST NOT静默覆盖、关闭或自动重放

#### Scenario: 深入专业结论
- **WHEN** 用户在设计/实现内选择审查或在开发实现内选择验证
- **THEN** 节点目录右侧 MUST直接展示时间、结论、问题及未覆盖范围，并保持各自专业来源
- **AND** MUST NOT把历史通过、缺少记录或用户答复解释为当前验收、通用授权或任务完成

### Requirement: 任务材料必须读取任务的实际文件现场
任务详情 MUST按任务关联、项目范围与受管工作树（Worktree）证据选择实际文件根；存在可用工作树时 MUST读取其中未提交的需求、方案、规范、清单、原型及任务引用的项目文档。副屏 MUST标识来源，不能混用保留副本正文。

#### Scenario: 工作树与主目录不同
- **WHEN** 同一相对文档在工作树中已修改而主目录仍是旧内容
- **THEN** 页面 MUST展示工作树正文；后续相对文档链接 MUST保持该任务现场

#### Scenario: 工作树缺失或身份漂移
- **WHEN** 已关联的工作树无法证明身份，或选定工作树中的文件缺失
- **THEN** 对应入口 MUST显示明确诊断或缺失，MUST NOT静默使用主目录同名文件冒充当前内容
- **AND** 已安全清理工作树、当前无工作树关联时 MUST可读取保留目录或归档内容并标明来源

#### Scenario: 限定文档范围
- **WHEN** 请求文档不属于任务项目范围、路径越界、为符号链接或非 Markdown
- **THEN** 任务文档入口 MUST拒绝读取，不能成为任意文件读取接口

#### Scenario: 从列表查看并切换任务
- **WHEN** 用户在筛选后的任务列表点击任务，再切换另一个任务
- **THEN** 系统 MUST复用已有副屏，主屏列表保持可操作且不重置筛选、已加载批次或滚动；MUST NOT创建嵌套分屏
- **AND** 每个新打开的任务 MUST默认显示任务需求正文，后台当前节点变化不得强制改变阅读选择

### Requirement: 节点阅读必须连续且内容按判断需要取舍
页面 MUST记住每个节点选中的文档、审查记录与阅读位置，关联阅读返回 MUST恢复原上下文；打开新任务 MUST默认需求。页面 MUST优先呈现实际阶段、结论、问题及未覆盖范围，MUST NOT堆叠重复标题、无内容栏目或内部结果摘要值。历史通过 MUST明确表达为最近保存的结论，不能推导当前版本通过。

#### Scenario: 对照方案与实现
- **WHEN** 用户选择设计文档，切到开发实现，再返回方案设计
- **THEN** 页面 MUST保持所选设计文档和阅读位置，不退回默认提案

#### Scenario: 多份需求名称相同
- **WHEN** 任务关联多个变更且均有 brief
- **THEN** 需求内容选项 MUST用关联变更名称区分；单文件 MUST直接显示正文

#### Scenario: 收尾中确认成果
- **WHEN** 任务具有待验收事项或已记录用户意见
- **THEN** 任务收尾 MUST显示该事项及现有答复动作，保存意见 MUST不自动完成任务

### Requirement: 任务总览与列表必须优先呈现判断所需事实
任务详情 MUST直接显示任务目标、状态、当前节点标记和待人处理事项，范围与实际更新时点 MUST可直接获知，不通过通用任务信息目录中转。任务列表 MUST有表头并采用紧凑分列，标题与进展最多占两行，项目、状态、更新时点按空间显示；编号 MUST不占额外列表行。

#### Scenario: 从紧凑列表进入任务
- **WHEN** 用户在列表打开任务副屏
- **THEN** 列表 MUST保持筛选与位置，详情总览 MUST可直接解释当前工作；窄布局 MUST保持任务和状态可读且不产生页面横向溢出

#### Scenario: 必要操作与原文引用
- **WHEN** 用户阅读任务与已有材料
- **THEN** 界面 MUST保留原文中的有效文档引用，MUST NOT为同一材料重复显示技术目录入口；接续指令 MUST明确是生成指令，完成登记 MUST在任务级更多菜单，普通阅读 MUST不要求人工更新进展

#### Scenario: 避免多层导航和结论重复
- **WHEN** 用户查看方案设计或开发实现
- **THEN** 页面 MUST用单一节点导航与节点左侧内容目录组织正文，审查和验证在所属节点目录列出并可直接读取报告
- **AND** 页面 MUST NOT在总览、节点选项和报告中重复堆叠同一检查状态；宽副屏总览可在正文侧边展示，窄副屏 MUST回流且不挤压正文

#### Scenario: 恢复窗口焦点
- **WHEN** 用户切离浏览器后再次返回
- **THEN** 任务详情 MUST NOT因窗口 focus 或 visibilitychange 自动重新读取
- **AND** 用户明确刷新和维护后的必要更新 MUST继续有效

#### Scenario: 全局清单与来源
- **WHEN** 任务材料可读取
- **THEN** 简介下方属性行 MUST呈现项目、各关联变更的实际材料来源与最后更新时间，全局侧栏 MUST直接呈现实施清单，节点正文 MUST NOT重复来源脚注
- **AND** 阅读抽屉关闭后 MUST保留节点文档及阅读位置

#### Scenario: 统一文件与记录阅读
- **WHEN** 用户选择节点文档、历次审查或验证记录
- **THEN** 页面 MUST在节点左侧目录标记当前选择，并在右侧展示内容；多次审查 MUST直接列出次数、日期和结论而非藏于菜单
- **AND** Markdown 文档 MUST复用共享阅读组件，可在渲染正文与实际原文之间切换

#### Scenario: 随时登记完成
- **WHEN** 任务处于可维护状态且用户打开任务级操作菜单
- **THEN** 页面 MUST提供登记完成，与编辑和放弃处于同级，且 MUST保留原有并发与适用授权校验

#### Scenario: 精简重复信息与目录层级
- **WHEN** 用户读取任务详情
- **THEN** 编码 MUST位于标题下方；顶部 MUST NOT重复展示常规阶段进展和下一步，必要待人处理事项 MUST保持可见
- **AND** 规范项 MUST以规范分组与文件子项展示，审查记录 MUST作为具名审查分组的子项展示；报告 MUST NOT追加单独审查对象或内部版本区块，原专业事实 MUST保持不变

#### Scenario: 统一目录与专业结果呈现
- **WHEN** 用户浏览规范、审查记录或验证结果
- **THEN** 规范与审查 MUST采用同级分组和统一子项缩进，审查正文 MUST标明所选次数
- **AND** 验证单项状态仅在与总结果一致且只有一项时可不重复展示，其他情况 MUST逐项就近展示；所有检查摘要、未覆盖项和适用性 MUST保留
