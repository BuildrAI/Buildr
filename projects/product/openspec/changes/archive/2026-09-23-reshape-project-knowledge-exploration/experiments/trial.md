# 结构探索试用与样例取舍

## 实际试用

2026-09-22，独立智能体（Agent）使用本目录的 [repowiki-exploration 草案](repowiki-exploration/SKILL.md)，承接原始请求：“我是需要理解和判断软件的工程师，请基于当前项目事实，给我 Buildr 的整体认识，以及一次任务如何完成的说明草稿。结构清楚，足以让我继续提出问题，具体细节深度由你判断。”逆向依据与推断另见 [evidence.md](evidence.md)。

试用基线为 `f0cac46992420b7ecb7e4df7dda052a6135a4f11`。先读适用规则与现有导航，再核对角色分工、对象关系、方法投射、任务写入、摘要答复及验证保存的当前规范与源码；没有启动服务、运行构建、浏览网络或登记正式任务。最初两份草稿与方法记录仅写系统临时目录，完成后才收到本轮长期样例建设授权。

初稿文件为 `01-buildr-overview.md`、`02-task-completion.md` 和 `03-trial-notes.md`，分别包含整体认识、单次工作的完成过程及方法观察。它们是本轮临时试用产物，不注册成另一套长期正文；本轮结果以下列两个实际样例承接：

- [Buildr 整体认识](../../../../knowledge/docs/overview.md)
- [从需求讨论到任务收尾](../../../../knowledge/docs/architecture/task-system.md)

## 真实观察与最终选择

| 观察 | 本轮采取的选择 |
|---|---|
| 已有导航能快速定位职责，但现成说明并不保证涵盖最新行为 | 核对关键实现；试用发现旧任务主文基于 `1e353c9e`，当前规范和实现已增加显式组合结束，最终正文补上该分支 |
| 高层问题有时必须深入函数才能确认答复是否执行、完成是否交付 | 调查读到写入路径，主文以关系和判断边界表达，不展示字段、函数和技术栈清单 |
| “整体认识”可以无限扩大到安装、发布、数据和每个适配器 | 以业务目的、主要职责与三组关系结束主线；继续探索指向已有专业资料 |
| 正式任务记录与普通工作的完成容易混在一起 | 先说明成果达到目标，再讲保存记录、交付和清理；不暗示所有工作必经固定阶段 |
| 旧总览同时承担产品介绍与详细参考，一次直接压缩可能丢失约束 | 逐段核对下表去向；当前关系已变化的旧定义明确校准，其他细节复用已有正文或规范，不新增深度文章 |
| 独立草稿包含 Mermaid，但当前网页正文阅读器不支持它和 HTML 折叠块 | 最终样例用职责表并复用已存在的 Archify 图；没有新增这两类不支持的块 |
| 初稿对工具实现名称的展示偏多，虽有来源但增加阅读负担 | 正式总览删除程序标识与技术栈堆砌，必要实现只保留可追溯入口 |
| 根执行者在真实预览中确认两个页面与引用正常，同时观察任务正文从原约 989 汉字增加到约 1765 汉字，仍有手册化倾向 | 最后再压缩为过程表、三个判断边界和三个继续问题；验证保存时机、隔离与提案细节、自举执行器等转为已有专业链接按需阅读 |
| 调查曾因批量输出过长截断，并出现不存在的推测规范路径和无匹配通配符 | 后续按已存在的导航、确切路径和必要行段读取；没有把定位失败误报为产品功能缺失 |

本轮证明草案能支持一次有依据、可接续的解释，并帮助发现既有说明遗漏的分支；不证明不同执行者总能选择相同或适合所有人的深度。根执行者已走查第一次落地的两个页面与引用，最终阅读效果仍需人的反馈；最后一次精简后的页面是否重新核对，由本轮整体检查报告。既有任务图继续作为完整可选场景，正文明确它没有展开新的组合结束分支。

## 原总览内容去向

行号对应基线提交中的 `knowledge/docs/overview.md`，用于查找旧段落；它们不是新正文的长期同步清单。范围覆盖全部正文段落、表格及列表。表中“承接”表示现有专业资料或规范继续拥有该事实，不表示本轮修改了它们。

| 原行号 | 原段落的独有内容 | 当前保留位置或校准依据 |
|---|---|---|
| 3—5 | 面向组织的共享工作事实和工作方法 | 保留于总览开头；角色与当前治理范围由 [agent-first-product-positioning](../../../specs/agent-first-product-positioning/spec.md) 定义。 |
| 7—12 | 产品中英文简介原文 | 英文原文保留于总览末尾，中文含义放在开头；未改变产品口径。 |
| 14—16 | 自然语言进入工作、智能体代办、手动兜底 | 保留于总览开头和职责段；依据 [agent-first-product-positioning](../../../specs/agent-first-product-positioning/spec.md)。 |
| 20—29 | 核心口径、共享工作环境、人与产品分工 | 口径原文和分工保留；细分见 [product](../../../../knowledge/docs/architecture/product.md)。 |
| 31 | 硬门禁只保护真实结果与副作用 | 总览保留原则，分类与设计要求转读 [governance-gate-taxonomy](../../../../knowledge/docs/architecture/governance-gate-taxonomy.md) 和随包核心规则。 |
| 35—43 | 个人经验、工具切换、多实现与跨岗位依赖问题 | 总览“为什么需要它”合并表达；不宣称自动发现全部依赖。 |
| 47—63 | 七类信息与上下文概念、选择责任、检索工具和举例 | 总览保留从信息空间到本次输入的简明关系；完整定义由 [glossary](../../../../knowledge/docs/glossary.md) 与 [agent-first-product-positioning](../../../specs/agent-first-product-positioning/spec.md) 承接，检索工具和例子不单独建文。 |
| 65—67 | 两类公开解释不是封闭资产枚举、未来形态不能当事实 | 总览保留开放概念和未来边界；完整约束见 [agent-first-product-positioning](../../../specs/agent-first-product-positioning/spec.md)。 |
| 71—82 | 组织、项目、服务旧树形模型及真实 Git 边界 | 原树形唯一归属已过时；按 [project-service-repositories](../../../../knowledge/docs/architecture/project-service-repositories.md)、[workspace-asset-relationships](../../../specs/workspace-asset-relationships/spec.md) 和 [repository-instance-registry](../../../specs/repository-instance-registry/spec.md) 校准为共享引用，保留真实代码边界。 |
| 86—96 | 主要资产形式与两类登记字段 | 总览保留资产作用；字段和当前引用模型由 [buildr-data-design](../../../../knowledge/docs/architecture/buildr-data-design.md)、[workspace-asset-relationships](../../../specs/workspace-asset-relationships/spec.md) 承接，旧服务直接父字段不保留为当前事实。 |
| 98 | 源资产不存二进制、凭证和个人配置 | 总览保留环境边界；完整清单见 [command-line-tool-assets](../../../specs/command-line-tool-assets/spec.md)。 |
| 100 | 技能体系入口 | 总览继续链接 [buildr-skill-system](../../../../knowledge/docs/architecture/buildr-skill-system.md)。 |
| 102 | 遗留 Practices 数据保留与按语义整理 | 现有 [root-organization-workspace](../../../specs/root-organization-workspace/spec.md) 的“保留遗留 Practices 目录”“遗留 Practices 内容迁移说明”完整承接。 |
| 104 | 组件生命周期、完整性、禁止执行扩展、命令引用保护 | 由 [managed-components](../../../specs/managed-components/spec.md) 及 [buildr-skill-system](../../../../knowledge/docs/architecture/buildr-skill-system.md) 承接。 |
| 106 | 命令定义、项目需求、本机观察分别归属且不安装二进制 | 由 [command-line-tool-assets](../../../specs/command-line-tool-assets/spec.md)、[project-command-requirements](../../../specs/project-command-requirements/spec.md) 承接。 |
| 110—122 | 智能体优先协作与初始化、诊断示例 | 总览保留直接工作方式；具体采用入口见 [usage](../../../../knowledge/docs/guides/usage.md)，不保留逐步命令作为总览主线。 |
| 124 | Doctor 的通用与专项范围、选中适配器、ready 与修复计划 | 由 [agent-readable-doctor](../../../specs/agent-readable-doctor/spec.md) 和 [development-and-operations](../../../../knowledge/docs/guides/development-and-operations.md) 承接。 |
| 126 | 跨岗位发现共同基础、不设固定岗位路由与全依赖保证 | 总览说明共同基础与信息未必齐备；完整职责见 [agent-first-product-positioning](../../../specs/agent-first-product-positioning/spec.md)。 |
| 130—134 | Web 认知入口、渐进范围、无服务也能工作、低风险维护 | 总览职责表和三组关系保留；当前交互由 [human-agent-onboarding](../../../specs/human-agent-onboarding/spec.md)、[workspace-asset-management-interactions](../../../specs/workspace-asset-management-interactions/spec.md) 承接。旧“所有创建均仅形成指令”等绝对表述以当前具体能力为准。 |
| 138—146 | 三类命令表面、可发现性与授权分别治理 | 由 [cli-product-surface](../../../specs/cli-product-surface/spec.md) 承接，不再把命令分类塞进总览。 |
| 148 | 维护命令、退役命令、OpenSpec、内部来源标识与兼容参数 | 由 [cli-product-surface](../../../specs/cli-product-surface/spec.md)、[openspec-deterministic-sync](../../../specs/openspec-deterministic-sync/spec.md)、[openspec-contract-guard](../../../specs/openspec-contract-guard/spec.md) 承接；具体上游版本以锁定配置和规范为准。 |
| 152—158 | 源资产与运行时入口、唯一技能根、目标和冲突保护 | 总览保留原则；完整布局、目标与归属要求见 [buildr-skill-system](../../../../knowledge/docs/architecture/buildr-skill-system.md)、[workspace-first-runtime-projection](../../../specs/workspace-first-runtime-projection/spec.md) 和 [managed-skill-assets](../../../specs/managed-skill-assets/spec.md)。 |
| 160 | 本机网页、任务观察与有限维护、复盘读取、全局变更只读 | 总览保留本机和共享事实边界；具体行为由 [buildr-web-client](../../../specs/buildr-web-client/spec.md)、[task-record](../../../specs/task-record/spec.md)、[task-retrospectives](../../../specs/task-retrospectives/spec.md)、[change-asset-indexing](../../../specs/change-asset-indexing/spec.md) 承接。旧“只能编辑 active”不延续为完整当前声明。 |
| 162 | npm 唯一分发、宿主 Node、可选图形入口、退出与未来桌面形态 | 当前分发见 [open-source-release](../../../../knowledge/docs/flows/open-source-release.md)、[buildr-application-payload](../../../specs/buildr-application-payload/spec.md)、[buildr-web-instance-lifecycle](../../../specs/buildr-web-instance-lifecycle/spec.md)；未来桌面边界保留于总览。 |
| 164 | 网页接续、归档只读、工作资产与本机结构化数据 | 总览保留接续与分存含义；具体入口见 [buildr-web-client](../../../specs/buildr-web-client/spec.md)、[task-professional-http-contracts](../../../specs/task-professional-http-contracts/spec.md)、[workspace-structured-data-store](../../../specs/workspace-structured-data-store/spec.md)。 |
| 166—168 | 旧项目/服务字段及 Git 当前状态只观察 | 按当前共享模型校准，字段详见 [buildr-data-design](../../../../knowledge/docs/architecture/buildr-data-design.md) 和 [repository-instance-registry](../../../specs/repository-instance-registry/spec.md)；登记不自动切分支的约束保留在已有对象关系专题。 |
| 172 | 适配器注册表与完整能力面 | 由 [Agent Runtime Adapters](../../../../services/buildr/docs/agent-runtime-adapters.md)、[workspace-first-runtime-projection](../../../specs/workspace-first-runtime-projection/spec.md) 承接。 |
| 173 | 声明式计划与通用比较、写入、清理分工 | 由 [buildr-skill-system](../../../../knowledge/docs/architecture/buildr-skill-system.md)、[workspace-first-runtime-projection](../../../specs/workspace-first-runtime-projection/spec.md) 承接。 |
| 174 | 共享原语但独立身份与证据、禁止别名兜底 | 由 [Agent Runtime Adapters](../../../../services/buildr/docs/agent-runtime-adapters.md) 和 [workspace-first-runtime-projection](../../../specs/workspace-first-runtime-projection/spec.md) 承接。 |
| 175 | 适配器发现事实与新接入最小证据 | 由 [Agent Runtime Adapters](../../../../services/buildr/docs/agent-runtime-adapters.md) 承接。 |
| 176 | 规则按真实范围祖先链和子树投射，不判断语义 | 由 [root-organization-workspace](../../../specs/root-organization-workspace/spec.md)、[workspace-first-runtime-projection](../../../specs/workspace-first-runtime-projection/spec.md) 承接。 |
| 177—179 | Codex、Claude Code、Cursor、Qoder、TRAE 等具体布局 | 由 [Agent Runtime Adapters](../../../../services/buildr/docs/agent-runtime-adapters.md) 的当前对应适配器说明承接，不在总览重复易变路径。 |
| 180 | 同步递归范围与跳过目录 | 由 [workspace-first-runtime-projection](../../../specs/workspace-first-runtime-projection/spec.md) 及适配器专业说明承接。 |
| 181 | 正式交付记录、默认隔离、真实准备入口与资源归属 | 任务样例保留核心判断；完整方法见 [agent-task-workflows](../../../specs/agent-task-workflows/spec.md)、[task-environments](../../../specs/task-environments/spec.md)。 |
| 182 | 声明接入触发、两个声明文件、范围与写入者 | 由 [buildr-project-declaration-system](../../../../knowledge/docs/architecture/buildr-project-declaration-system.md)、[project-declaration-intake](../../../specs/project-declaration-intake/spec.md) 承接。 |
| 183 | 本机数据库、复盘正文与状态、退役表清理 | 由 [buildr-local-data](../../../../knowledge/docs/architecture/buildr-local-data.md)、[workspace-structured-data-store](../../../specs/workspace-structured-data-store/spec.md)、[task-retrospectives](../../../specs/task-retrospectives/spec.md) 承接。 |
| 184 | 工作树容器不是主工作空间、操作不证明业务完成 | 任务样例保留结果区别；完整约束见 [task-environments](../../../specs/task-environments/spec.md)。 |
| 185 | 协调入口与独立应用、不得维护第二份进度证据 | 任务样例解释共享结果；专业模型见 [task-system](../../../../knowledge/docs/architecture/task-system.md) 和 [task-execution-module-boundaries](../../../specs/task-execution-module-boundaries/spec.md)。 |
| 186 | 方案与实现同一隔离策略、不得猜测归属 | 任务样例通过任务分流链接保留按需入口，完整约束见 [agent-task-workflows](../../../specs/agent-task-workflows/spec.md)。 |
| 187 | 测试地图少量稳定入口、技能引导与应用只保存 | 由 [workspace-testing-and-verification-framework](../../../../knowledge/docs/architecture/workspace-testing-and-verification-framework.md)、[project-test-capabilities](../../../specs/project-test-capabilities/spec.md) 承接。 |
| 188 | 开发直接运行检查、开发后选择报告、不统一执行 | 任务样例保留执行与报告分工；细节由 [task-verification](../../../specs/task-verification/spec.md) 承接。 |
| 189 | 单份当前验证报告、身份、适用性、结论、不决定交付 | 任务样例保留判断边界；协议细节由 [task-verification](../../../specs/task-verification/spec.md) 承接。 |
| 190 | 预览自身保存进程与归属，不拥有任务结果 | 由 [worktree-buildr-web-preview](../../../specs/worktree-buildr-web-preview/spec.md)、[buildr-local-data](../../../../knowledge/docs/architecture/buildr-local-data.md) 承接。 |
| 191 | 两种可选审查、原子结果写入、非门禁 | 任务样例保留用途；完整模型由 [task-review-results](../../../specs/task-review-results/spec.md) 承接。 |
| 192 | 产品验证证明范围与既有检查适用性 | 任务样例继续链接测试说明；产品专业参考为 [verification-framework](../../../../knowledge/docs/architecture/verification-framework.md)。 |
| 193 | 收尾组合能力、无任务不补建、无统一机器历史 | 任务样例保留；完整方法由 [task-closeout](../../../../knowledge/docs/flows/task-closeout.md)、[task-closeout-orchestration](../../../specs/task-closeout-orchestration/spec.md) 承接。 |
| 194 | Git 专业操作输入与无状态边界 | 由 [direct-git-closeout](../../../specs/direct-git-closeout/spec.md) 和 [Git 操作技能](../../../../services/buildr/resources/workspace/skills/buildr/git-operations/SKILL.md) 承接。 |
| 195 | 复盘显式请求、只基于可见事实、不自动改资产或建任务 | 由 [task-retrospectives](../../../specs/task-retrospectives/spec.md) 和 [product](../../../../knowledge/docs/architecture/product.md) 承接。 |
| 196 | 常规收尾不授权强推、丢弃、改历史等 | 由 [task-closeout](../../../../knowledge/docs/flows/task-closeout.md) 与 [收尾技能](../../../../services/buildr/resources/workspace/skills/buildr/task-finish/SKILL.md) 承接。 |
| 197 | 自举与验证分别成立、唯一执行器、update 只更新 CLI 来源 | 任务样例通过收尾链接保留按需入口；详细职责由 [自举图示依据](../../../../knowledge/archify/flows/task-self-bootstrap.md)、[buildr-cli-self-update](../../../specs/buildr-cli-self-update/spec.md) 承接。 |
| 198 | 未支持工具不冒用其他适配器 | 由 [Agent Runtime Adapters](../../../../services/buildr/docs/agent-runtime-adapters.md)、[workspace-first-runtime-projection](../../../specs/workspace-first-runtime-projection/spec.md) 承接。 |
| 200 | 退役研发/规划/收尾/环境聚合；完成只存结果 | 任务样例保留实际成果与状态区别；退役细节见 [task-execution-module-boundaries](../../../specs/task-execution-module-boundaries/spec.md)、[task-record](../../../specs/task-record/spec.md)、[task-environments](../../../specs/task-environments/spec.md)。 |
| 204—206 | MVP 既有验证陈述及能力导航 | 总览仅表达当前可确认范围，不把旧总结冒充本轮验证；专业能力继续从架构入口、当前规范及各领域结果阅读。 |
| 208 | 企业云、权限、托管、多用户、跨机及全部适配器不在 MVP | 总览当前边界显式保留。 |
| 210 | OpenSpec 独立增强、冲突/陈旧检查、上游写入与恢复 | 由 [openspec-change-lifecycle](../../../../knowledge/docs/flows/openspec-change-lifecycle.md)、[openspec-contract-guard](../../../specs/openspec-contract-guard/spec.md)、[openspec-deterministic-sync](../../../specs/openspec-deterministic-sync/spec.md) 承接。 |
| 212 | 组件片段组合与完整性、自然语言增强而非执行钩子 | 由 [buildr-skill-system](../../../../knowledge/docs/architecture/buildr-skill-system.md)、[managed-components](../../../specs/managed-components/spec.md) 承接。 |
| 214 | 核心完整性保护、原子写入、事务恢复与权限边界 | 由 [managed-data-integrity](../../../specs/managed-data-integrity/spec.md)、[technical](../../../../knowledge/docs/architecture/technical.md) 承接。 |
| 216 | 打包输出归属回执、摘要与安全替换 | 由 [buildr-package-assets](../../../specs/buildr-package-assets/spec.md) 的“package build 输出安全”要求承接。 |
| 218 | 组件不包含项目/服务作用域、远程依赖求解与执行扩展 | 由 [managed-components](../../../specs/managed-components/spec.md) 承接；总览只概括资产形式，不扩张为这些能力。 |
| 222 | 未来规划入口 | 总览保留 [产品方向汇总](../../../../docs/roadmap/product-directions.md)；未修改规划正文。 |

## 阅读关联与检查边界

两个样例继续使用原文件路径，正文全部采用原生相对链接。总览增加稳定阅读对象和成果；已有任务来源、专业成果与规则引用优先复用，只为此前没有索引的必要阅读对象添加来源。任务正文补齐直接链接所需的来源关联，不重排其他索引内容。

本代理完成静态文件检查：核对新正文与本记录的相对链接目标存在、两份正文直接引用均能在局部索引找到对象、来源身份无重复、关系引用有效，检查文件末尾和不支持的块。没有在本次样例编辑中运行服务、构建、浏览器或测试；这些结果不能代替页面可读性验证。根执行者已报告首次落地后的真实页面与引用正常；最后一次正文精简后的页面核对，以及目录发现、图示、返回与追问接续的整体结果，由本轮根执行者分别报告。

本轮未全面检查所有专业文档的陈旧表述，也未展开安装、发布、全部适配器和异常恢复。已确认旧总览的唯一父归属定义与当前共享引用模型不一致，本轮校准样例；任务旧专业图与协调文章的范围差异在正文注明，没有擅自扩展修改范围。
