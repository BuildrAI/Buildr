# Buildr 项目术语表

本表解释日常使用与协作中的核心概念；规范、代码和登记保存各自的权威事实。测试执行、发布恢复及字段细节分别查阅[测试与验证](architecture/workspace-testing-and-verification-framework.md)、[发布流程](flows/open-source-release.md)和[数据设计](architecture/buildr-data-design.md)，不在总表重复操作步骤。

## 工作空间（Workspace）

- 定义：Buildr 的工作范围、治理根和发现入口。
- 适用范围：组织登记、长期工作资产（Work Asset）及本机协作记录。
- 避免混用：目录内的普通文件、依赖和临时内容不会自动成为受治理资产。
- 来源：[数据设计](architecture/buildr-data-design.md)。

## 项目（Project）

- 定义：承载业务目标、约束与相关资料，并引用参与实现的服务（Service）。
- 适用范围：`projects/manifest.yml` 登记的项目（Project）及其实际来源根。
- 避免混用：不是独立工作空间（Workspace），也不是服务（Service）的唯一父对象；同一服务（Service）可以被多个项目（Project）引用。
- 来源：[项目、服务与代码库](architecture/project-service-repositories.md)。

## 服务（Service）

- 定义：具有明确实现职责的全局业务对象，引用一个代码库实例（Repository Instance）并以 `modulePath` 定位代码。
- 适用范围：根部 `services/manifest.yml` 登记的服务（Service）及项目（Project）引用。
- 避免混用：不按项目（Project）目录确定唯一归属，也不等于独立 Git 仓库或智能体（Agent）入口。
- 来源：[项目、服务与代码库](architecture/project-service-repositories.md)。

## 代码库实例（Repository Instance）

- 定义：具有稳定身份、代码来源与物理位置的代码基础，可被多个服务（Service）引用。
- 适用范围：`repositories/manifest.yml` 中的登记；Git 来源还可声明集成分支。
- 避免混用：相同远端地址不等于同一实例；临时工作树（Worktree）不会自动成为新实例。
- 来源：[项目、服务与代码库](architecture/project-service-repositories.md)。

## 工作资产（Work Asset）

- 定义：被明确组织、登记或纳入治理，可长期维护和复用的工作事实或方法。
- 适用范围：规则（Rule）、技能（Skill）、命令定义（Command Definition）、规范、项目（Project）资料等长期来源。
- 避免混用：普通文件、临时内容和一次查询结果不会仅因可见或被使用而成为工作资产（Work Asset）。
- 来源：[产品定位规范](../../openspec/specs/agent-first-product-positioning/spec.md)。

## 产物（Artifact）

- 定义：工作中形成或改变，可查看和接续的中间成果或最终结果。
- 适用范围：文档、代码、数据记录、Git 改动及外部系统中的实际结果。
- 避免混用：不只指构建文件；产物（Artifact）存在不等于目标完成，也不自动成为长期工作资产（Work Asset）。
- 来源：[产品定位规范](../../openspec/specs/agent-first-product-positioning/spec.md)。

## 规则（Rule）

- 定义：表达价值观、权威与授权边界、约束和结果不变量的长期要求。
- 适用范围：组织、项目（Project）及服务（Service）的适用规则（Rule）与受管核心规则（Rule）。
- 避免混用：不承载命令序列、专业流程或当前任务（Task）状态；这些由方法与应用（Application）负责。
- 来源：[核心规则](../../services/buildr/resources/workspace/AGENTS.md)。

## 技能（Skill）

- 定义：可由智能体（Agent）按用户意图发现、读取和执行的工作方法及随附资源。
- 适用范围：以 `SKILL.md` 为入口的内置、组织自有和组件（Component）方法。
- 避免混用：不是执行结果、运行中的智能体（Agent）或应用（Application）；投射副本不是新的源资产。
- 来源：[技能体系](architecture/buildr-skill-system.md)。

## 能力契约（Capability Contract）

- 定义：跨技能（Skill）协作所需的输入、副作用、最低保证与结果证据约定。
- 适用范围：需要稳定协作边界或可替换提供者（Provider）的方法。
- 避免混用：不是每个技能（Skill）都必须拥有的接口，也不表示实际执行已经成功。
- 来源：[能力契约参考](../../services/buildr/docs/skill-capability-contracts.md)。

## 能力绑定（Capability Binding）

- 定义：在适用范围内，为某项能力及版本选择提供者（Provider）。
- 适用范围：工作空间（Workspace）和项目（Project）的能力选择、解析与诊断。
- 避免混用：选择提供者（Provider）不等于触发执行；技能（Skill）名称相似也不能证明满足契约。
- 来源：[技能体系](architecture/buildr-skill-system.md)。

## 组件（Component）

- 定义：把相关规则（Rule）、技能（Skill）、命令集合及内容增强作为一组安装和维护的资产包。
- 适用范围：OpenSpec、Archify 等受管集成及其成员。
- 避免混用：不是前端组件（UI Component）或组件测试（Component Test）；成员维护边界由组件（Component）声明确定。
- 来源：[组件规范](../../openspec/specs/managed-components/spec.md)。

## 命令定义（Command Definition）

- 定义：描述外部工具的识别、版本探测和诊断方式的长期资产。
- 适用范围：命令清单及项目（Project） `commands.yml` 中引用的工具需求。
- 避免混用：不是可执行文件、工具安装、登录凭证或一次执行记录。
- 来源：[数据设计](architecture/buildr-data-design.md)。

## 智能体运行时（Agent Runtime）

- 定义：承载智能体（Agent）工作，并按自身机制发现规则（Rule）、技能（Skill）和工具的宿主环境。
- 适用范围：Buildr 已支持适配的 Codex、Claude Code、Cursor 等宿主。
- 避免混用：不是 Buildr 自身的 Node.js 进程；目录与投射标记不能证明当前宿主身份。
- 来源：[技能体系](architecture/buildr-skill-system.md)。

## 运行时投射（Runtime Projection）

- 定义：依据当前源资产和适用配置，为目标智能体（Agent）生成可发现入口。
- 适用范围：技能（Skill）正文、附件、规则（Rule）入口及其本机所有权记录。
- 避免混用：生成成功不证明宿主已加载、当前会话已采用或工作已经完成。
- 来源：[技能体系](architecture/buildr-skill-system.md)。

## 工作信息空间（Work Information Space）

- 定义：所有可能为工作提供依据的可访问信息来源。
- 适用范围：文件、数据库、网页、外部接口、聊天、机器状态和工具结果。
- 避免混用：范围大于 Buildr 工作空间（Workspace），也不代表全部由 Buildr 治理。
- 来源：[产品定位规范](../../openspec/specs/agent-first-product-positioning/spec.md)。

## 共享工作环境（Shared Work Environment）

- 定义：工作资产（Work Asset）、发现入口和运行时投射（Runtime Projection）共同形成的整体工作体验。
- 适用范围：人和智能体（Agent）在同一工作空间（Workspace）中发现事实、约束和方法。
- 避免混用：不是另一个智能体（Agent），也不替智能体（Agent）形成完整任务上下文（Task Context）。
- 来源：[产品架构](overview.md#工作范围与资料怎样组织)。

## 智能体软件（Agentic Software）

- 定义：引入智能体（Agent）理解目标、判断或执行工作，并交付产品结果的软件。
- 适用范围：智能体（Agent）参与交付的功能，可从局部能力开始。
- 避免混用：仅使用智能体（Agent）开发代码，不自动使被开发产品成为智能体软件（Agentic Software）。
- 来源：[产品定位规范](../../openspec/specs/agent-first-product-positioning/spec.md)。

## 上下文（Context）

- 定义：与某个对象、范围或目标相关，可供发现和使用的信息。
- 适用范围：工作空间（Workspace）、项目（Project）和服务（Service）等范围内的已知资料及外部来源。
- 避免混用：不是固定存储结构，不等于已装入模型请求的内容，也不全是受管资产。
- 来源：[产品定位规范](../../openspec/specs/agent-first-product-positioning/spec.md)。

## 任务上下文（Task Context）

- 定义：智能体（Agent）为当前任务（Task）选择、组织和压缩形成的语义工作集。
- 适用范围：当前目标、相关资产、外部事实、工具证据及已确认决定。
- 避免混用：不是原始检索结果全集，也不是 Buildr 保存的工作摘要（Work Context）或完整聊天。
- 来源：[产品定位规范](../../openspec/specs/agent-first-product-positioning/spec.md)。

## 请求上下文（Request Context）

- 定义：某一次模型请求实际携带的相关资料、指令和对话输入。
- 适用范围：同一任务（Task）中按当前步骤发起的每次模型调用。
- 避免混用：不是任务上下文（Task Context）的完整副本，也不是模型可承载的容量。
- 来源：[产品概览](overview.md)。

## 上下文窗口（Context Window）

- 定义：模型单次请求可承载的有限容量；实际内容由该次请求决定。
- 适用范围：理解一次调用的信息限制及长期工作跨请求接续。
- 避免混用：不是持久知识、全部任务上下文（Task Context）或工作空间（Workspace）。
- 来源：[产品概览](overview.md)。

## 词元（Token）

- 定义：模型处理文本的基本单位，可以是字、词的一部分、标点或其他片段。
- 适用范围：模型输入输出、上下文窗口（Context Window）容量、用量与成本。
- 避免混用：不是身份认证（Authentication）等安全领域的令牌（Token）。
- 来源：[产品概览](overview.md)。

## 工作空间本机数据存储（Workspace Local Data Store）

- 定义：一个工作空间（Workspace）中仅保存在本机的协作数据及控制记录范围。
- 适用范围：SQLite、复盘正文、每日演进及明确声明的本机文件。
- 避免混用：不是单个数据库，也不表示这些内容都可丢弃或已被 Git 备份。
- 来源：[数据设计](architecture/buildr-data-design.md)。

## 工作空间文件存储（Workspace File Store）

- 定义：以文件和目录保存、由各自责任方维护的工作事实与资产正文。
- 适用范围：清单、规则（Rule）、技能（Skill）、规范和知识文件等。
- 避免混用：不是工作空间（Workspace）全部文件的统称，也不包含 SQLite 中的任务记录（Task Record）。
- 来源：[数据设计](architecture/buildr-data-design.md)。

## 工作空间结构化存储（Workspace Structured Store）

- 定义：每个工作空间（Workspace）独立的 SQLite，用于结构化协作数据、关系和事务（Transaction）。
- 适用范围：`.buildr/local/workspace.sqlite` 中的任务（Task）及相关记录。
- 避免混用：不是跨机器同步协议；每日演进与复盘正文不保存在其中。
- 来源：[数据设计](architecture/buildr-data-design.md)。

## 正式任务（Formal Task）

- 定义：目标与交付意图已经对齐、以稳定任务（Task）标识进入 Buildr 管理的工作。
- 适用范围：需要持久记录、查看和接续的工作。
- 避免混用：普通对话或智能体（Agent）临时分工不会自动成为正式任务（Formal Task）；任务记录（Task Record）不是编辑许可。
- 来源：[任务记录规范](../../openspec/specs/task-record/spec.md)。

## 任务目标（Task Goal）

- 定义：希望实现的结果及必要范围、约束，是验收成果的依据。
- 适用范围：任务（Task）创建、查看、修订和接续；现有 `intent` 字段表示同一目标。
- 避免混用：不是最近进展、下一步或已成立的交付结果。
- 来源：[任务记录规范](../../openspec/specs/task-record/spec.md)。

## 任务记录（Task Record）

- 定义：保存任务（Task）身份、目标、范围、父子关系、顶层状态和结果的当前事实。
- 适用范围：SQLite 中的 `todo|active|completed|abandoned` 任务（Task）。
- 避免混用：不保存完整聊天或统一执行过程；审查（Review）、验证（Verification）与工作摘要（Work Context）各自维护。
- 来源：[任务系统](architecture/task-system.md)。

## 工作摘要（Work Context）

- 定义：某项任务（Task）当前的进展、下一步、工作节点、待处理事项及人的答复。
- 适用范围：跨轮次接续和 Buildr Web 的进展、回应展示。
- 避免混用：不是智能体（Agent）完整任务上下文（Task Context）、工具日志或任务（Task）顶层状态；保存答复不自动执行下一步。
- 来源：[工作摘要规范](../../openspec/specs/task-work-context/spec.md)。

## 父任务 / 子任务（Parent Task / Child Task）

- 定义：以直接关系组织整体目标和可独立交付的子目标。
- 适用范围：需要分别说明范围、成果与验收的协作。
- 避免混用：不是临时并行分工；子任务（Child Task）完成不自动完成父任务（Parent Task）或替代总体验收。
- 来源：[任务系统](architecture/task-system.md)。

## 任务审查（Task Review）

- 定义：智能体（Agent）或人对明确方案、成果作出判断，由应用（Application）保存对象、结论与未覆盖项。
- 适用范围：方案与完成两种可选审查（Review），各有当前结果和完整历史。
- 避免混用：不是实际测试执行、业务验收或任务（Task）推进许可。
- 来源：[审查结果规范](../../openspec/specs/task-review-results/spec.md)。

## 任务验证（Task Verification）

- 定义：依据实际执行的检查与内容身份，保存或读取任务验证报告（Task Verification Report）。
- 适用范围：当前报告中的检查、结果、未覆盖项及适用性。
- 避免混用：Buildr 不替智能体（Agent）运行项目（Project）测试；验证（Verification）通过也不等于业务验收或已交付。
- 来源：[任务验证规范](../../openspec/specs/task-verification/spec.md)。

## 任务收尾（Task Finish）

- 定义：完成约定成果交付、已有任务（Task）结果登记及安全善后的结束动作。
- 适用范围：有无正式任务（Formal Task）、有无 Git 管理的工作；日常也称收尾与交付。
- 避免混用：记录完成、真实交付、应用（Application）生效和资源清理分别成立，不是固定阶段执行器。
- 来源：[任务系统](architecture/task-system.md)。

## 任务复盘（Task Retrospective）

- 定义：根据已结束任务（Task）的可见事实，分析执行效率与协作问题的本机文档。
- 适用范围：用户明确要求后的复盘正文，以及任务（Task）上的文档摘要与决定状态。
- 避免混用：不是审查（Review）或完成门禁；“已决定”不表示改进已实施，也不自动创建后续任务（Task）。
- 来源：[任务复盘规范](../../openspec/specs/task-retrospectives/spec.md)。

## 项目每日演进（Project Daily Progress）

- 定义：按项目（Project）和日期保存、基于明确 Git 提交范围生成的本机每日汇总。
- 适用范围：新增、更新、删除和弊端四类说明，以及可关联的已有任务（Task）。
- 避免混用：不是任务（Task）状态或长期知识；产品读取不自动生成摘要，文件不跨机器共享。
- 来源：[每日演进规范](../../openspec/specs/project-daily-progress/spec.md)。

## 项目环境准备声明（Project Environment Preparation Declaration）

- 定义：可选 `preparation.yml` 中描述项目（Project）或服务（Service）真实准备入口的长期声明。
- 适用范围：按需调用的依赖准备、代码生成及工具初始化。
- 避免混用：不是任务（Task）计划、运行结果或统一环境就绪状态。
- 来源：[数据设计](architecture/buildr-data-design.md)。

## 项目测试地图（Project Testing Map）

- 定义：`verification.yml` 中现有稳定测试体系及其范围、完整入口与选择指导。
- 适用范围：智能体（Agent）根据目标和改动发现、选择并调用实际检查。
- 避免混用：不是逐个测试文件清单、执行计划或测试结果；地图存在不证明检查已运行。
- 来源：[数据设计](architecture/buildr-data-design.md)。

## Git 工作树提供方（Git Worktree Provider）

- 定义：创建、检查和安全清理任务（Task）工作树（Worktree），核对真实仓库、分支与归属的能力。
- 适用范围：已明确隔离位置的任务（Task）及相应 Git 操作。
- 避免混用：工作目录可用不等于依赖、验证（Verification）或交付就绪；清理记录不能代替核对真实内容。
- 来源：[工作树协作约定](../../services/buildr/resources/workspace/skills/contracts/buildr/git-worktree-provider/v1.md)。

## 变更（Change）

- 定义：OpenSpec 中表达一次行为变化的提案、设计、规范增量及实施清单。
- 适用范围：实际项目（Project）或所选规范根中的进行中与已归档变更（Change）。
- 避免混用：不是 Buildr 顶层任务（Task）；归档材料解释历史，当前承诺仍在正式规范中。
- 来源：[OpenSpec 变更生命周期](architecture/task-system.md#openspec-变更怎样推进)。

## OpenSpec 收敛（OpenSpec Convergence）

- 定义：完成变更（Change）的规范同步与归档，并核对当前输入、实际结果和必要恢复现场。
- 适用范围：Buildr 归档入口调用锁定的上游 OpenSpec 执行规范写入与归档。
- 避免混用：Buildr 不另做一套正常规范写入；只同步可保留变更（Change），收敛不等于任务（Task）完成或 Git 交付。
- 来源：[OpenSpec 变更生命周期](architecture/task-system.md#openspec-变更怎样推进)。

## 界面原型（UI Prototype）

- 定义：经用户授权、以模拟数据和受控交互呈现预期界面的可查看成果。
- 适用范围：实现前的方案对齐、任务（Task）材料展示及后续实现输入。
- 避免混用：不是正式运行结果或验证（Verification）证据；演示操作不能覆盖已确认业务语义。
- 来源：[界面原型规范](../../openspec/specs/ui-prototype/spec.md)。

## 代码地图（Code Map）

- 定义：解释真实实现职责及其目录、文件位置的结构映射。
- 适用范围：从功能定位代码，说明职责、关键协作与来源。
- 避免混用：不是源码副本、逐行索引或行为规范；目录存在也不证明解释正确。
- 来源：[代码地图方法](../../services/buildr/resources/workspace/skills/buildr/code-map/SKILL.md)。

## 技术图（Technical Diagram）

- 定义：有事实来源、可维护图源和可查看成果的技术关系图。
- 适用范围：系统、调用、数据、部署及其他有助理解的关系。
- 避免混用：不是原始事实来源，也不必先由代码地图（Code Map）生成。
- 来源：[知识建设与维护](architecture/knowledge-maintenance.md)。

## 解释文档（Explanatory Documentation）

- 定义：围绕阅读问题说明当前产品、技术与设计取舍的文章。
- 适用范围：概览、概念、架构、流程及使用开发说明，可引用地图和技术图（Technical Diagram）。
- 避免混用：不是第二套规范；未来设想须与当前事实区分，不要求先建齐所有成果。
- 来源：[知识建设与维护](architecture/knowledge-maintenance.md)。

## 知识阅读关联（Knowledge Index）

- 定义：连接对象、唯一成果正文、来源与阅读关系的局部索引。
- 适用范围：启用网页知识阅读的 `knowledge/index.yml`。
- 避免混用：不保存第二份正文或历史版本；没有索引的文档仍可独立阅读和维护。
- 来源：[知识阅读规范](../../openspec/specs/project-knowledge-browsing/spec.md)。

## 来源观察（Source Observation）

- 定义：读取已声明来源所得的当前内容摘要、可读状态和范围身份。
- 适用范围：知识阅读及相关成果维护，不与历史摘要自动比较。
- 避免混用：读取成功不代表语义已核验；阅读不会自动改写成果或形成确认流程。
- 来源：[知识查询实现](../../services/buildr/src/modules/knowledge/application/knowledge-query.ts)。

## Buildr Web

- 定义：通过浏览器提供的本机界面，读取和操作同一份 Buildr 工作事实。
- 适用范围：`buildr web` 启动的本机 HTTP 运行时（Runtime）及正式前端。
- 避免混用：不是独立桌面产品、远程云端产品或第二套业务数据。
- 来源：[技术架构](architecture/technical.md)。

## Buildr Web 启动器（Buildr Web Launcher）

- 定义：启动已绑定 Buildr 安装并打开浏览器的平台图形入口。
- 适用范围：正式名称 Buildr Web，以及源码开发入口 Buildr Web Dev。
- 避免混用：不是独立安装更新渠道，不复制 Node.js 或取得工作空间（Workspace）数据所有权。
- 来源：[技术架构](architecture/technical.md)。

## Buildr 应用负载（Buildr Application Payload）

- 定义：一次构建形成、可按摘要核对的公共应用（Application）内容集合。
- 适用范围：命令行（CLI）、应用（Application）代码、网页运行时（Runtime）与静态资源、数据库迁移及生产依赖。
- 避免混用：不是 npm 压缩包或生成后的启动器；不包含 Node.js 与开发工具链。
- 来源：[应用负载规范](../../openspec/specs/buildr-application-payload/spec.md)。

## 发布轨道（Release Track）

- 定义：更新时选择的版本类别，`stable` 对应 npm `latest`，`candidate` 对应 `next`。
- 适用范围：版本检查及用户明确选择的正式版或候选版更新。
- 避免混用：不是 npm 与源码开发的安装来源，也不意味着相应标签已有可用版本。
- 来源：[命令行更新规范](../../openspec/specs/buildr-cli-self-update/spec.md)。
