## Context

Task Environment 当前把 `task-environment.yml` 中的 npm dependency roots 和 Service `requires` 图当作唯一准备计划来源。这个实现修复了 Buildr/buildr-web 的假 `ready`，但把一次自举技术事实升级成了通用产品框架：新技术栈必须先修改 Buildr 核心，Agent 对当前 Task 的判断无法成为可审计输入，未识别技术栈还可能被误判为不适用。

Task Environment 仍需保持 Workspace SQLite `task_environment_current` 唯一 authority、Task Record 无环境状态、retained manager ownership、worktree/provider、runtime projection、资源和 cleanup 等既有边界。变化只发生在“准备什么”及其逐步 readiness 的来源和表达方式。

## Goals / Non-Goals

**Goals:**

- 由 Agent 为当前 Task 明确登记一个可包含多个 Service、每个 Service 多个步骤的 Environment Preparation Plan。
- Task Environment 只提供通用的安全执行、输入/工具 identity、输出检查、逐步持久化、幂等恢复和聚合 readiness。
- 首次无 Plan、Task scope 覆盖不完整、步骤缺失或漂移时 fail closed，不能通过目录猜测返回 `ready`。
- `inspect` 严格只读；Local App GET 只读取保存的 current。
- Buildr 自举仍能通过受管 npm 准备 buildr/buildr-web，但 npm 只是 Agent Plan 的一个实例。

**Non-Goals:**

- 不建设 npm、Python、Cargo、Maven 等 package manager adapter registry。
- 不让 Task Environment 推断 Task scope、递归扫描 manifests、执行 shell 字符串或成为 Agent。
- 不保存凭证、任意环境变量、完整 stdout/stderr、Task 通用计划或 Verification Result。
- 不改变 Task Record、Task Verification、Git provider、dynamic resource 或 Finish 的 authority。

## Decisions

### 1. Agent Plan 是 Task-local machine fact，不是 Project 技术栈登记

新增 closed `buildr.task-environment-plan/v1`。Plan 绑定当前 Task Record scope，并包含`services`与可空`notApplicableReason`：Task有Service scope时必须按Service声明；Task没有Service scope时必须以非空`notApplicableReason`明确本Task不需要技术准备，不能用空数组隐含ready。每个Service声明：

- `selector`：必须是 Task scope 中已登记的 `service:<project>/<service>`；
- `disposition`：`required` 或 `not-applicable`；
- `reason`：`not-applicable` 时必填；
- `steps`：`required` Service 至少一个 required step，`not-applicable` Service 不得有步骤。

每个 Task-scoped Service 必须恰好出现一次。Agent 如果发现需要额外 Service，先通过 Task Record Application 明确扩展 scope，再登记新 Plan；Task Environment 不在背后扩大 Task scope。存在Service scope时`notApplicableReason`必须为空；没有Service scope时`services`必须为空且reason必填。

Plan 只保存在 `task_environment_current`，不进入 Git、Task Record、Project registry 或 lifecycle projection。Project knowledge、构建脚本、Verification declaration 和 Skills可以帮助 Agent判断，但都不是 Environment current writer。

替代方案是继续维护 Project recipes。拒绝该方案，因为它仍要求 Buildr/Project事先覆盖技术栈，并把“当前 Task 是否需要”与稳定Project事实混在一起。

### 2. 两阶段 prepare，同时允许一次调用完成

`prepare` 接受可选 `--plan <json-file>`：

- 首次携带 Plan：先准备受控 checkout/runtime foundations，再校验并保存 Plan，随后执行步骤；全部 required facts ready 后返回 `ready`。
- 首次未携带 Plan：只建立最小 Receipt、execution roots 和可供只读调查的 foundations，返回 `blocked / task_environment_plan_missing`；不得执行技术栈准备步骤。
- 已有 Plan 且未提供新 Plan：复用保存计划做幂等恢复。

另提供 `task environment plan record|inspect`。`record` 只在 matching Environment 已有受控执行根时原子替换 current Plan，并把旧准备结果标记 stale/blocked，不执行步骤；`inspect` 只读取保存的 Plan。这样 Agent既可在调用前完成判断，也可先取得只读Task checkout再登记。

### 3. Preparation Step 是无 shell 的通用命令声明

每个 step 声明：

- 稳定 `id`、Service-relative `cwd`、`required`、有界 `timeoutMs`；
- `executable`：`workspace-foundation` 命名工具、Task Service 内的相对 executable，或 Agent 明确选择的规范化绝对路径；
- 字符串 `args`，使用直接 process spawn，不经过 shell；
- Service-relative input files；
- Service-relative expected outputs及 `file|directory|executable` 类型。

Task Environment 只解析 executable 来源并验证路径/类型，不理解命令是不是 npm、uv、cargo 或 gradle。第一版不接受 caller-authored environment map、shell script text 或 secret value；需要复杂环境的仓库使用版本化的 Service wrapper executable。Plan 和 Receipt 会保存 args，因此 Agent不得把凭证放入参数。

替代方案是只让 Agent在外部执行并登记成功。拒绝该方案，因为 `prepare` 将失去实际准备与恢复职责，结果也无法逐步记录部分成功。

### 4. Readiness 由 plan identity、工具/输入 identity 和本地输出事实共同证明

Receipt v4 保存：

- `preparationPlan`：规范化 Plan 与 identity；
- `preparationServices`：逐 Service 聚合状态；
- `preparationSteps`：resolved cwd/executable、executable current/prepared identity、input current/prepared identities、output observations、状态、时间和最小 diagnostic；
- scope `preparation` 聚合 probe。

`prepare` 仅在 Plan identity一致、executable/input prepared identities仍匹配且全部预期输出存在并满足类型时跳过步骤。否则只重跑对应步骤。每次真实执行产生 `preparation-step-executed` effect；失败保存退出码/信号和有界、脱敏后的诊断，不保存完整输出。

`inspect` 只重算 executable/input identity并 `lstat` 输出；不执行 Plan command、不创建路径、不回写 Receipt。required step 任一 missing/drifted/failed/blocked会阻塞Service和Environment；optional step失败保留诊断但不阻塞聚合。

### 5. v4 替换 dependency-root 公共模型

Receipt 升级为 `buildr.task-environment-receipt/v4`，公共 Result 升级为 v3。v4 不再包含 `dependencyRoots`、manager、manifest或lockfile专用字段。SQLite表不新增列，仍保存一个经过Domain校验的current JSON payload。

v2/v3 Receipt 保持只读解析，用于显示 legacy diagnostic；live `inspect` 返回 blocked，要求 Agent 登记 Plan。只有显式 `plan record` 或携带 Plan 的 `prepare` 才升级v4，不从旧 npm roots自动合成新Plan，避免保留隐藏的技术栈authority。

### 6. Buildr 自举通过 Agent Plan 表达两 Service

移除 Product `task-environment.yml`。Task Environment Skill为Agent说明如何根据 Task scope、构建/验证事实形成Plan。Buildr自举的fresh-environment测试显式登记两个Service：

- buildr：Workspace Foundation `npm ci`，输入 `package.json`/`package-lock.json`，输出 `node_modules`；
- buildr-web：同样独立声明和执行。

正式Task如果只涉及无依赖Service，Agent仍必须登记该Service为`not-applicable`并给出理由。

## Risks / Trade-offs

- [Plan允许Agent选择命令，错误命令可能产生副作用] → 禁止shell字符串和环境变量，限制cwd/输入/输出在Service root，executable来源显式，保留Agent本身已拥有执行权这一边界。
- [绝对executable是机器相关事实] → Plan本来就是Workspace-local Environment current；保存并比较executable identity，机器变化时返回drifted。
- [首次prepare可能先返回plan-missing] → 支持`prepare --plan`一次完成；需要先调查Task checkout时才使用两阶段流程。
- [旧active v3 Environment升级后被阻塞] → 保留只读诊断，不静默生成npm Plan；Agent登记等价Plan后可在同一Receipt位置恢复。
- [输出存在不能证明所有运行时行为] → Environment只证明Agent声明的环境准备事实；业务行为继续由Task Verification负责。

## Migration Plan

1. 增加Plan/v4 Domain与v2/v3 legacy reader，先保持旧实现测试可运行。
2. 增加Plan record/inspect和`prepare --plan`，替换Application dependency declaration/installation路径。
3. 更新public schema、CLI、Local App、Skill/contracts和current knowledge。
4. 删除Product `task-environment.yml`及专用parser，迁移测试到显式Agent Plan。
5. 使用fresh Task workspace证明两个Service、多步骤、非npm命令、部分恢复和只读inspect。
6. 收敛并归档Change后交付；回滚时恢复上一版代码与v3 reader，SQLite current保留v4 bytes但旧运行时必须明确报告schema unsupported，不能改写。

## Open Questions

- 无。第一版明确不支持Plan内环境变量、远端secret注入或无本地输出的长期ready证明；这些需求以后通过独立Change评估。
