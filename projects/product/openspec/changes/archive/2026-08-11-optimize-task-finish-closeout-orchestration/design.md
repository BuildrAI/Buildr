## Context

Formal Task Finish 已经是一次 canonical CLI invocation 内完成的固定五阶段产品执行器。当前效率问题发生在两个产品边界之外：Agent 调用前重复装载上下文，以及 Buildr 自举 Workspace 在主任务交付后依照 Component contribution 手工执行 package sync、Git successor commit/push、development CLI/Local App 安装与最终 Doctor。现有 `buildr-self-bootstrap-sync` Skill 已定义动作分类、授权和失败边界，但执行仍依赖 Agent 逐条拼接命令，没有确定性 runner。

本变更同时受以下约束：

- Formal Finish 继续只公开 `run|inspect`，保持 `preflight → prepare → verify → deliver → cleanup`；
- self-bootstrap 只属于当前 Buildr 自举 Workspace，不能进入普通用户 Workspace 或通用 Finish executor；
- Task Finish Result、Git、sync、installer、Doctor 和 Task Environment 继续拥有各自事实，不新增聚合 store；
- Runner 必须能在 commit 已产生但 push 未完成等部分成功后安全重跑；
- Agent 等待行为必须适配宿主工具，不能把某个终端工具的 30 秒窗口写成产品完成时限。

## Goals / Non-Goals

**Goals:**

- 把 Finish 后稳定机械动作收敛为一个确定性、结构化、幂等可恢复的 Product 内部 runner，并由当前 Workspace Skill 独占调用。
- 让 Finish Result 明确报告实际解析出的最小上下文，便于 runner 和人工审计复用，不要求 Agent 构造或修改执行胶囊。
- 把 Finish 调用的等待语义固定为“启动一次、一次或多次有界长等待至终态”，减少短周期轮询和上下文往返。
- 保持 sync、commit、push、安装、Doctor 与 same-run resume 的独立阶段、独立结果和真实部分副作用。

**Non-Goals:**

- 不改变 Formal Finish 五阶段、Candidate、Verification、Review、Task Record 或 Environment cleanup authority。
- 不新增 `task finish` action、后台任务、队列、数据库表、Receipt、execution capsule 或通用 workflow engine。
- 不把 self-bootstrap runner 安装到普通 Workspace，也不把它建模成 Finish product phase。
- 不承诺固定两次工具调用或固定秒数完成；超时、需要输入或进程仍在运行时允许继续长等待。

## Decisions

### 1. Runner 作为 Product内部driver，由`buildr-self-bootstrap-sync` Skill独占调用

在`product/buildr` Service增加内部Node driver，由当前Workspace的`buildr-self-bootstrap-sync` Skill使用Environment交接的Node启动。Runner只接收`--run`、`--target`、`--node-executable`等最小定位输入，内部通过retained `projects/product/buildr task finish inspect --run ... --detail full --json`读取同一Finish Result，不接受调用方提交frozen paths、分类结果、成功布尔值或recovery manifest。

选择Product内部driver而不是Skill目录脚本：主要实现与fixture测试继续归Product Project edit root，Skill只保留用户意图、授权和路由。选择内部driver而不是新增公共Buildr CLI：self-bootstrap是当前Workspace Component的专属行为，公共命令会把能力错误暴露给普通Workspace。选择runner而不是继续依赖Agent逐条命令：动作顺序、分类和检查已稳定，机械拼接不再需要模型判断。

### 2. Runner 输出结构化、无持久状态的阶段结果

Runner 返回 `buildr.self-bootstrap-closeout-result/v1`，固定阶段为：

1. `preflight`：核对 Result 模式、run/Task、retained branch/ref/remote、Node、CLI 与 working tree；
2. `plan`：从 `carrier.changedPaths` 形成去重动作集合与 plan identity；
3. `sync`：按 plan 运行 retained workspace sync；
4. `commit`：只对 sync 产生或可证明由同一 run 遗留的精确 paths 创建/复用 successor commit；
5. `push`：核对完整 range 后普通 push 并远端读回；
6. `install-cli` 与 `install-local-app`：按分类执行现有 installer；
7. `finalize`：complete 模式运行一次最终 Doctor，doctor-blocked 模式恢复同一 Finish run。

每个阶段只报告 `passed|blocked|not-applicable`、输入/输出 identity、最小操作事实、已发生 effects 和 diagnostic。Result 只返回给当前 Agent，不写 SQLite、Task Record、Development、Finish Result 或新文件 authority。

### 3. 幂等恢复依赖可重算事实和带 run identity 的 successor commit

Fresh 路径要求 retained HEAD/remote 与 Finish `finalRemoteRef|remoteAfterRef` 一致。sync 前后的 Git 状态形成精确 owned paths；runner 禁止 `git add -A`，只 stage 这些 paths并复核 staged set。

如果 runner 在 commit 后中断，successor commit 使用固定 trailer 绑定 Finish run和plan identity。重跑时只有以下事实全部成立才复用：该 commit 是 frozen ref 的单一后继、trailer匹配、sync 重算后tree clean、changed paths属于当前 plan、remote仍为 frozen ref或已经等于该 successor。否则 fail closed，不 amend、不 rebase、不 reset、不猜测归属。

commit 与 push 仍形成两个阶段结果；commit 成功、push 失败时保留本地历史并明确报告 remote 未变化。Installer 与 Doctor 本身幂等时可以重跑，但不会据此重放 commit/push。

### 4. `resolvedContext` 是 Finish Result 的只读投影，不是输入或新 authority

`buildr.task-finish-result/v2` 增加 additive `resolvedContext`：

- `capability: { id: "buildr.task-finish", version: 1 }`；
- Task/handoff/Candidate/Content Target identity；
- Agent、target branch、remote 与 Workspace Node identity；
- 基于这些值计算的 `identity`。

它完全来自 run identity中已经保存的权威事实；调用方不能传入，repository不增加独立列或查询，Result持久化仍随同一 compact terminal payload完成。入口缺口发生在 run 创建前时，blocked response也从同一 readiness observation形成可空摘要，而不是要求 Agent补写。

选择 additive projection 而不是持久化 capsule：capsule会引入创建者、修改、失效和恢复责任；只读投影无需维护，权威事实变化时由新 run自然生成新值。

### 5. 等待策略属于 Task Finish Skill 的宿主适配规则

Task Finish Skill 要求 Agent启动 canonical command 后使用宿主支持的有界长等待；等待操作应尽量只在进程终态、需要输入或等待上限到期时返回。若返回仍为running，继续等待同一session，不启动第二个Finish、不高频读取普通输出。

不在产品中写死45秒、60秒或“两次调用”。终端 `yield` 只控制何时交还Agent，不是Finish timeout；不同宿主可以选择自身允许的最大安全等待窗口。

## Risks / Trade-offs

- [Runner 直接编排 Git 增加实现复杂度] → 复用 Git Operations 的既有安全约束，固定单一 successor、精确stage、完整push range、禁止历史改写，并用fixture覆盖部分成功恢复。
- [无持久状态使跨会话恢复信息有限] → 恢复只依赖 Finish Result、Git refs/commit trailer、runtime安装和Doctor等可重算事实；无法证明时保留现场并blocked，不新增store兜底。
- [Result additive 字段增加payload] → `resolvedContext`只保存少量identity，不复制Environment Receipt、handoff正文或绝对执行计划。
- [不同Agent工具的等待接口不同] → spec约束语义而非参数名；各runtime Skill只使用当前宿主已支持的长等待机制。
- [self-bootstrap脚本可能被普通Workspace误调用] → preflight必须确认当前Workspace安装匹配的`buildr-self-bootstrap` Component并且Finish frozen paths命中专属动作，否则返回not-applicable或blocked。

## Migration Plan

1. Additive 更新 Task Finish Result/domain与system/contract tests；旧terminal v2 Result缺少 `resolvedContext` 时reader按 `null` 兼容，不迁移历史行。
2. 增加Product内部runner、fixture tests和Skill/Component说明；保持旧手工步骤作为失败诊断说明，不再作为正常路径逐条执行入口。
3. 更新 Task Finish Skill 的等待规则和 self-bootstrap contribution routing。
4. 运行 package/static、Task Finish、self-bootstrap runner、Skill projection与full canonical验证。
5. Formal Finish 后由旧版已加载Skill仍可按既有手工路径完成首次自举；完成package/workspace sync后，新runner成为后续任务的正常入口。回滚只需恢复Skill/script与additive Result字段，不涉及数据迁移。

## Open Questions

无。用户已确认不持久化执行胶囊、采用有界长等待而非写死时长，并允许runner在一次结构化编排中执行sync、独立commit/push、安装和最终读回。
