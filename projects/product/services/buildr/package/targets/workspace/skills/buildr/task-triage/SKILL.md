---
name: task-triage
description: 用户提出修复、实现、重构、优化、文档/测试或契约语义调整，或询问任务应走代码修改、当前事实维护还是 OpenSpec Change 时使用。
---

# Task Triage Skill

本 Skill 只核对任务事实、作出正交决策并交接专业动作；不复制 Task Environment、OpenSpec 或验证手册，也不建立确定性路由器。

## 1. 核对任务事实

只读任务相关范围，不做全量审计。确认：

- 用户希望外部行为或长期事实如何变化；
- 相关 canonical specs、current knowledge、active Changes、实现、测试与 registries，以及其中的事实 authority；
- 完整 Git repository set，使用 Workspace/Project/Service selector，不按目录层级猜测边界；
- 写入授权、不可逆影响和仍需用户决定的语义冲突。

authority 冲突、授权或 repository set 不明、不可逆行为缺少决定，或是否进入实现仍未知时，停止对应写入，只询问会改变长期语义、责任边界或授权的最少问题。

## 2. 两轴决策

### 语义治理

| 选择 | 判定 | 动作 |
|---|---|---|
| `code-only` | canonical spec 已覆盖目标，且修改不改变可观察契约 | 不创建 Change |
| `spec-maintenance` | specs、实现、registries 或已确认决定已证明当前事实，只需文档追上事实 | 不补造 Change；current knowledge 使用 `maintain` |
| `change-flow` | 改变 SHALL/MUST、API、状态流、权限、业务规则、数据语义、兼容性或其他可观察承诺 | 一个独立业务目标一个 Change |
| `blocked` | authority、业务语义或授权无法确认 | 报告冲突和最少决策问题 |

工程细节默认不进入 OpenSpec；但默认值、存储或内部机制一旦改变外部行为、数据含义、兼容性、安全边界或业务承诺，仍走 `change-flow`。不得用 `spec-maintenance` 绕过新需求评审，也不得用 `code-only` 掩盖规范缺失或事实不明。

若任务改变依赖、构建或测试入口，先把已确认Task scope与变更事实交给`declaration-intake`做只读差异检查；长期`preparation.yml`/`verification.yml`写入仍需用户确认并由各owner Skill完成。Triage不直接维护声明。

### 执行形态

- `implementation`：修改代码、运行构建/测试，或需要长期开发上下文。
- `metadata-only`：仅维护 OpenSpec artifacts、Rules、Skills、文档或模板，不进入代码、构建或测试。
- `unknown`：信息不足；先澄清，不提前写 Change artifacts 或当前事实。

该轴独立于语义治理：正式持久交付都需要Task Environment；Agent根据Task完整Project/Service scope、Project `preparation.yml`与当前构建/验证事实选择Recipe形成Environment Plan。`metadata-only`可以使用共享执行根，不必创建Git worktree，并对每个Project/Service scope显式选择Recipe或声明not-applicable；进入实现时仍复用同一Receipt或由Environment确定性恢复。

## 3. 条件化交接

执行前读取相应 optional binding、contract 和 selected provider；provider 不 ready 时只阻塞或降级对应分支，保留其他已确认结论。

| 分支 | Capability / 动作 | 必要输入与成功证据 | 失败处理 |
|---|---|---|---|
| 新正式 Task 的 Git 基线 | `buildr.git-operations/v1` 的独立 `fetch` 与 `rebase` | 完整 repository set 均证明当前为 clean `dev`、upstream 为 `origin/dev`；每个 operation 返回 before/after、effects 与 current facts，适用 Workspace transition check ready | 任一前置事实、provider、fetch、rebase、冲突恢复或 Doctor blocked 时不调用 Task Record `create`；报告全部部分 effects，不换策略 |
| 正式持久交付 | `buildr.task-record/v1` 的 `create` 或 `inspect` | stable Task ID、title、intent、canonical Workspace 与真实 scope/Change；首次持久交付写入前返回 `created|inspected`、path 和 effects | provider 不 ready 或 blocked 时停止正式交付写入；讨论、只读和 metadata maintenance 不依赖 |
| 正式执行位置 | `buildr.task-environment/v1` 的 Plan `record/inspect` 与 Environment `prepare/inspect` | Task ID、canonical Workspace、完整 Task Project/Service scope、Project `preparation.yml`及Agent选择的Recipe；首次持久交付写入前取得`ready`、实际execution roots、validation root和执行CLI | Declaration/Plan缺失或scope不完整时只阻塞execution；不猜技术栈，不回退到cwd或旧Receipt |
| 独立 current knowledge `spec-maintenance` | `buildr.current-knowledge-maintenance/v2` 的 `maintain` | Project、targets、fact sources、授权、tree identity；返回 `aligned|updated|not-applicable` | `unresolved` 报 authority 冲突；`change-required` 重新进入 `change-flow` |
正式持久交付包括代码、文档、配置、Rule、Skill、OpenSpec Change、验证声明或其他准备交付的持久变化。已有 Task Record 或 Local App 已创建时先 inspect 并核对 intent/scope，不重复 create，也不重新执行创建前 Git 基线门禁；本次动作仅维护已有生命周期 metadata 时不递归创建新 Task，也不要求重新准备已清理的 Environment。Task Record provider 不可用时不得手写 YAML 代替。其他 provider 不可用时只阻塞对应分支：本 Skill 只选择专业动作；Environment 的准备、恢复和清理由 selected provider 负责。current knowledge provider 不可用时，不得回退为无 evidence 的直接编辑或伪造 Change。

### 从 Parent 规划项启动独立 Child Task

当用户选择 active Parent Task 中的某个规划项作为独立 Child Task 实施时，先 inspect Parent Task，并只读读取其 current planning facts、关联 Change working copy和适用 Planning Review，从中提取该 Child 的稳定 intent、实际Project/Service scope、边界、验收目标与父级planning identity。Parent导引只作为Child启动输入；Parent/Child关系不表达Git继承、Change共享或专业状态传播。

Child Task必须先以`--parent <parent-task-id>`和自身scope创建，且初始不引用Parent Change；`0..N` Change允许此时保持空列表。取得Child自己的matching ready Environment并调用selected `buildr.task-development/v2` provider建立研发事实后，才在Child execution root中创建该独立目标自己的窄Change，通过Task Record update添加引用，并刷新Development planning snapshot与适用Planning Review。不得把Parent Change、Parent worktree、branch、Environment Receipt或Development事实复制或继承为Child authority。

如果Child真实依赖Parent尚未交付的代码，必须在Parent active时先建立Parent/Child关系，但延后Child Environment prepare；Parent完成正式Finish且贡献进入最新`dev`后，再从收敛后的canonical `dev`准备Child Environment。不得通过从Parent worktree派生Child checkout或提前共享未归档Change绕过该顺序。

### 新正式 Task 创建前收敛统一 dev 基线

只有即将调用 Task Record `create` 时执行本门禁；`inspect`、已有 Task 继续、纯讨论、只读探索和不创建 Task 的分支不执行。

1. 以已经解析的完整 repository set 为输入，按 selector 固定顺序逐个核验真实 Git root、当前符号分支恰为 `dev`、upstream 恰为 `origin/dev`、remote/ref 可读、index 与 working tree clean，并且没有 rebase、merge、cherry-pick 等进行中的 Git operation。任一事实不成立时在 tree/history 零写入状态返回 `blocked`；不 checkout、不 stash/autostash、不猜其他 branch/remote。
2. 读取 optional `buildr.git-operations/v1` binding；在本 create 分支把 ready selected provider 作为 required。先为全部 repositories 逐一选择独立 `fetch` operation，明确 `origin` 与 `dev`，消费每个 Result。任一 fetch blocked 时不执行尚未开始的 rebase，不创建 Task，并报告全部已发生的 remote-ref effects。
3. 全部 fetch 成功后重新核验 `dev`、`origin/dev` 与 clean 状态，再按同一顺序为每个 repository 明确选择 `rebase` operation，将本地 `dev` rebase 到本次观察的 `origin/dev`。本地已对齐、仅落后或含未 push 且未共享 commit 都使用同一 operation；provider 不自行选择 merge 或 push。
4. rebase 冲突时，consumer 明确授权 provider 只在 pre-state 已证明 clean 时执行有界 `rebase --abort`。只有 branch、HEAD、index 与 working tree 精确恢复到 pre-rebase facts 才记为 recovered；无论恢复是否成功，本次 Task create 都是 `blocked`。abort 失败或恢复不可证明时保留现场。已经在其他 repository 成功的 fetch/rebase 不反向回滚，必须作为部分 effects 报告。
5. 任一 rebase 返回 `treeChanged: true` 时，按 required Core 对相应 Buildr Workspace 执行当前 Agent 的 workspace transition check；Doctor 或必要收敛未 ready 时不创建 Task。
6. 只有完整 repository set 的 fetch、rebase、恢复检查与适用 transition check 全部成功，才调用 selected `buildr.task-record/v1` provider 的 `create`。Task Record Application、Local App 与 Task Environment 不获得任何 Git mutation 或本门禁状态 authority。

选择 `change-flow` 时，先确保正式 Task Record，再完成执行位置判断并使用适用的 `openspec-*` Skill。首次采用、状态实质变化、暂停、完成或用户询问时，从 CLI 刷新并报告 change id、resolved path、action、status、progress 和 next action/blocker；未创建时只写 `planned`，不猜测路径或进度。Buildr 自有 artifacts 和用户说明正文使用中文；命令、路径、标识符、协议字段与 OpenSpec 格式关键字可保留英文。

实现型任务按共享实现区域、验证入口或失败影响面分组。正式 Task 取得 ready Environment 后，在写入首个 proposal、方案或实现内容前调用 selected `buildr.task-development/v2` provider 的 `begin` 建立研发聚合事实；后续专业 planning artifact 变化时更新 planning snapshot。需要设计测试框架、划分测试边界、编排场景或为实现开发测试时使用 `project-testing`；它不维护 capability declaration 或 Result。内容、测试和 review 修订完成后仍由 Development 收敛 current knowledge/Change、观察 stable Content Target、形成 policy，并调用 selected `buildr.task-verification/v3` provider 维护 current Task Result，再继续 Candidate、Completion Review、decision 与 handoff。triage 不接管这些 provider，也不预设 minimal/affected/candidate 层级；Development provider 在该正式分支不 ready 时停止首次研发写入，不能回退为无 Receipt 流程。

## 4. 输出契约

```text
任务分流：
- 语义治理：code-only / spec-maintenance / change-flow / blocked
- 执行形态：implementation / metadata-only / unknown
- Repository set：<selectors 或 unresolved>
- Git 基线：converged / none / blocked（仅新正式 Task create；包含 dev/origin/dev 与部分 effects）
- Task Record：create / inspect / none / blocked
- Task Environment：prepare / inspect / none / blocked
- 事实依据：<最小 authority/evidence>
- 未决事项：<none 或冲突/授权问题>
- 下一动作：<selected capability/provider action 或用户决定>
```

只有选中 OpenSpec 时追加对应状态。任务进度直接使用 Task Record、Parent/Child、各专业公开 read model、Local App 与对话表达；不得把 readiness、planned identity、文件存在或单次 finding 冒充行为成功。

## Guardrails

- 不为过去事实补造 Change 历史，不把 current knowledge 变成第二套规范。
- 不在正式 Task 的首次持久交付写入后才补做 Task Record 或 Task Environment 决策。
- 不把创建前 Git 基线门禁塞进 Task Record Application、Local App 或 Task Environment，也不把多仓库操作伪装为原子 transaction。
- 不使用未经 authority 或 CLI 确认的路径、状态、进度和完成结论。
- 不把一次集中验证解释为覆盖尚未执行、stale 或存在 coverage gap 的适用 delivery-required capability。
