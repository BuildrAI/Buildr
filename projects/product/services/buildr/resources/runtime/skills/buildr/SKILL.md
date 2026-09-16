---
name: buildr
description: 安装或更新 Buildr、同步工作空间、诊断或维护工作资产，以及采用组织工作方式时使用；任务执行使用对应专业技能。
---
# Buildr Skill

Buildr 治理组织工作资产并投射到智能体运行时（Agent runtime）。工作事实说明“做什么”，工作方法说明“怎么做”；源资产、当前诊断和实际命令是依据，运行时（Runtime）是可重建入口。Buildr 不接管智能体（Agent）的理解、推理或执行，也不保存本机版本偏好。

Agent 是 Buildr 功能的默认操作入口。在用户目标和已有授权内直接执行并验证；只在缺少业务决定或授权时询问。用户选择手动操作，或当前工具、权限、登录态不支持时，再提供准确手动入口。

## 执行与按需读取

1. 确认目标工作空间（Workspace）；未指定时从当前目录定位组织根，`--target` 不指向服务（Service）代码仓。
2. `<agent>` 使用当前宿主的明确身份，通过 `buildr runtime list --json` 核对支持；用户指定其他运行时（Runtime）时遵从其选择。不得从技能路径、生成标记或 Doctor 检测结果推断宿主。无法对齐时只停止依赖 `<agent>` 的动作，不借用其他适配器（Adapter）。
3. 已初始化且本次维护需要现状时，运行一次 `buildr doctor --agent <agent> --target <dir> --json`；已有同一现场的诊断直接复用。首次初始化按下表办理，不先制造缺失诊断。
4. 选择下表对应动作；采用内部流程、调整工作方式、修改或替换 Skill 行为时，先加载 `capability-adaptation` 判断是否触达或产生跨 Skill 稳定依赖边界。
5. 写入后消费最新 Doctor 结果：`init --agent`、`sync`、组件（Component）安装或卸载已包含最终诊断；其他资产写入后再运行 Doctor。只有诊断指向专项问题或用户要求细查时追加 `commands check` 或 `runtime check`。

| 当前目标 | 读取与动作 |
|---|---|
| 安装、检查或更新 Buildr | [安装与更新](references/asset-maintenance.md#安装与更新)；不猜目标工作空间（Workspace） |
| 初始化工作空间（Workspace） | `buildr init --agent <agent> --target <dir> --name <name> --profile <personal\|team\|company>`；使用内置最终 Doctor，首次使用交接见 [资产维护](references/asset-maintenance.md#workspace--organization-root) |
| 更新或同步工作空间（Workspace），或处理检出内容变化 | [工作空间更新与检出变化](references/asset-maintenance.md#工作空间更新与检出变化) |
| 项目（Project）、服务（Service）、代码库实例（Repository Instance）、规则（Rule）、技能（Skill）、命令（Command）、组件（Component）或内置能力（Builtin）维护 | 按对象读取 [资产维护](references/asset-maintenance.md) 中对应小节；涉及组件（Component）成员时先核对整体所有权 |
| 投射、发现或适配器（Adapter）问题 | 读取 [运行时维护](references/runtime.md)；只检查当前目标运行时（Runtime） |
| 查看或继续任务、测试、交付 | 下方专业入口；缺少匹配任务不补造记录 |

## 专业入口
Agent runtime 先根据 Skill description 和用户目标发现入口 Skill。本 Skill 只有在 Buildr 管理意图与自身 description 匹配后才会被加载；它不是所有用户意图之前的全局 dispatcher，也不拦截 prompt。“收尾”等专业意图通常由 Agent 直接命中对应入口 Skill，再由该 Skill 读取自身的受管 capability bindings。

本 Skill 已加载后，只对下面明确列出的 Buildr 管理意图按需解析对应 capability。需要可替换 provider 时，在已初始化 workspace 运行当前 Agent Doctor 的 full detail，读取当前 scope 的 `capabilities` graph，再定位该项 contract 和 selected provider；不要把整张 consumer graph 当成本 Skill 的依赖表。`ready` 只表示结构可路由。调用 provider 前读取 contract 和 provider；不得根据 Skill id、description 或安装顺序猜测 conformance，也不需要 capability dispatch 命令。


| 用户意图 | 资产类型 |
|---|---|
| 查看待办/正式Task、Parent/Child、复盘文档状态与各专业当前状态 | `buildr.task-record/v3`及Review、Verification公开read model；复盘正文从`.buildr/local/task-retrospectives/<task-id>.md`读取 |
| 启动或继续已有active Formal Task | `buildr task inspect <task-id> --json`核对目标与scope；Agent再按真实Git/文件现场选择直接工作或matching Worktree |
| 查看 Parent/Child 关系、旧 Parent Plan 与整体完成观察 | `task parent inspect`；关系和终态由 Task Record 管理，旧 Parent Plan 只读 |
| 按需生成或查看已结束Task的执行效率复盘 | `task-retrospective`纯Skill基于当前可见事实写本机Markdown；Task Record v3只登记文档摘要和人的决定状态 |
| 设计或优化 Project / Service 测试框架、划分测试边界、编排场景，或为实现任务开发测试 | `project-testing` Skill；无 Result、Receipt 或 provider contract |
| 探查或维护Project测试地图、开发中选择已有前后端测试，或开发完成后记录和查看Task验证报告 | `buildr.task-verification/v4` selected provider；Agent直接调用项目测试工具 |
| 显式创建、检查或清理 Task 的 Git worktree/provider evidence | `buildr.git-worktree-provider/v1` selected provider |
| 从 proposal、方案或直接实现开始完成开发工作 | Agent 直接读取目标、OpenSpec、Git、代码、文件和专业结果，并按适用 Skill 使用现有工具；不创建研发回执 |
| 用户要求“收尾”“交付”或完成当前工作 | `task-finish` 技能依据真实现场组合 Git、系统工具和已有 Buildr 接口；有任务则登记真实结果，无任务不创建，不要求旧候选或交接链 |
| 已明确 repository/ref 的 commit、push、commit+push 或其他已选 Git Operation | `buildr.git-operations/v1` selected provider；本 Skill 或直接用户继续决定 operation、目标与顺序 |

产品入口 Buildr Skill 只对自身已命中的 Buildr 管理意图执行内部能力路由；顶层 capability 的 binding 只选择 provider，不自动产生 Agent 意图命中。单项 capability blocked 不得阻塞 init、doctor、Project/Service 或其他无关动作。

正式任务（Formal Task）不是编辑、构建或有界测试的通用许可。用户授权、实际仓库、引用和内容归属明确时直接工作；需要隔离时使用 `worktree create|inspect` 返回的真实工作目录。准备、代码生成和测试由项目（Project）或服务（Service）的实际工具负责。收尾由 `task-finish` 组合既有能力，本入口不复制流程。

## 完成

报告实际修改、验证、投射范围与遗留。复用当前动作已返回的诊断，不重复执行；存在相关错误时不能宣称该动作完成。仅将本次目标要求的长期信息写回对应源资产。

入口不可用或运行时（Runtime）损坏时使用 `buildr bootstrap guide`。
