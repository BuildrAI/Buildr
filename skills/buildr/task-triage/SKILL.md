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

首次修改 proposal、Skill、代码、测试或当前知识前，从直接相关的 canonical specs、current knowledge、实现、测试与 registries 建立一次有界 authority source map。该 map 只用于当前 Agent 工作上下文，不写入 Task Record、Development Receipt、sidecar 或其他产品 authority；后续只有 scope、authority 或相关事实变化时才增量刷新，不反复全量扫描。

authority 冲突、授权或 repository set 不明、不可逆行为缺少决定，或是否进入实现仍未知时，停止对应写入，只询问会改变长期语义、责任边界或授权的最少问题。

### UI Prototype 选择

若当前 Task、提案或预期实现可能产生用户可见的前端 UI 变化，向用户询问：“本次是否需要先生成界面原型（UI Prototype）？”询问只负责取得选择，不生成文件，也不改变语义治理或执行形态判断。

只有用户在当前任务中明确确认需要，才在方案已有足够上下文、正式前端实现开始前加载 selected `ui-prototype` Skill。用户拒绝、未确认或直接要求继续时不调用 Skill，正常推进后续流程；不得创建占位文件、waiver、Result、Receipt 或 blocker。UI Prototype 不替代 OpenSpec Change、Planning Review 或正式实现。一旦当前 Task 已生成原型，除非用户明确要求忽略，后续 Agent 必须在正式前端编辑前读取全部相关原型并按其信息架构、布局和交互开发。

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

该轴独立于语义治理。Formal Task Record本身不是编辑、构建或有界测试的通用工作许可：用户授权、repository/ref、owned scope与副作用边界均明确时，Agent可以直接工作，但不得把该路径冒充ready Environment、Development、Formal Verification、Candidate、Finish或cleanup事实。选择Buildr-managed checkout、Preparation、runtime projection、持久资源、正式环境证据或自动Finish时，才必须根据Task完整Project/Service scope与Project `preparation.yml`形成Environment Plan并取得ready；`metadata-only`受管执行可以使用共享执行根。

## 3. 条件化交接

已有或刚创建的active Formal Task优先运行`buildr task next <task-id> --target <canonical-workspace> --json`。它只读组合Task、Environment与Development当前最小事实：`required`表示必须先恢复的authority/identity安全前置，`recommended`只是默认推进建议，用户可以选择其他仍满足对应owner contract的合法动作。只读取Snapshot当前next返回的capability contract与selected provider；不要为发现未来阶段运行Doctor full或预读完整Review、Verification、Finish。Snapshot不自动执行、不替代专业owner写前重验。

按 next executable action 渐进装配上下文：执行当前动作前读取相应 optional binding、contract、selected provider 与直接 authority，Verification、Completion、Finish 等下游阶段只在成为当前动作时再读取。该边界不允许跳过已触发 Skill、required Rule、provider contract、授权或 result evidence；provider 不 ready 时只阻塞或降级对应分支，保留其他已确认结论。

用户已经授权实现时，先选择直接工作或Buildr受管正式证据路径。直接工作在真实Git、文件ownership与副作用边界内立即推进并如实报告证据范围；需要OpenSpec managed flow、Development、Formal Verification、Candidate、自动Finish、Task-owned资源或cleanup时，取得matching ready Environment后立即进入proposal或当前首个研发动作。

| 分支 | Capability / 动作 | 必要输入与成功证据 | 失败处理 |
|---|---|---|---|
| 新正式 Task 的 Git 基线 | `buildr.git-operations/v1` 的独立 `fetch` 与 `rebase` | 完整 repository set 分别证明current integration branch、matching upstream与clean状态；每个 operation 返回before/after、effects与current facts，适用Workspace transition check ready | 任一目标解析、前置事实、provider、fetch、rebase、冲突恢复或Doctor blocked时不调用Task Record `create`；报告全部部分effects，不换策略 |
| 待办意向 | `buildr.task-record/v2` 的 `create --status todo` | 用户已接受但尚未启动的意向、stable ID、title、intent、scope与可选复盘来源；只返回SQLite record/effects | 不运行Git基线，不创建Environment、Change或专业placeholder |
| 正式持久交付 | `buildr.task-record/v2` 的 active `create`、todo `activate` 或 `inspect` | stable Task ID、title、intent、canonical Workspace 与真实 scope/Change；首次执行写入前返回 current active record | provider或Git门禁blocked时停止正式交付写入；已有active inspect不重复门禁 |
| 正式执行位置 | `buildr.task-environment/v1` 的 Plan `record/inspect` 与 Environment `prepare/inspect` | Task ID、canonical Workspace、完整 Task Project/Service scope、Project `preparation.yml`及Agent选择的Recipe；首次受管效果前取得`ready`、实际execution roots、validation root和执行CLI | Declaration/Plan缺失或scope不完整时只阻塞消费Environment authority的动作；不猜技术栈，不回退到cwd或旧Receipt |
| 独立 current knowledge `spec-maintenance` | `buildr.current-knowledge-maintenance/v2` 的 `maintain` | Project、targets、fact sources、授权、tree identity；返回 `aligned|updated|not-applicable` | `unresolved` 报 authority 冲突；`change-required` 重新进入 `change-flow` |
正式持久交付包括代码、文档、配置、Rule、Skill、OpenSpec Change、验证声明或其他准备交付的持久变化。已有 Task Record 或 Buildr Web 已创建时先 inspect 并核对 intent/scope，不重复 create，也不重新执行创建前 Git 基线门禁；本次动作仅维护已有生命周期 metadata 时不递归创建新 Task，也不要求重新准备已清理的 Environment。Task Record provider 不可用时不得手写 YAML 代替。其他 provider 不可用时只阻塞对应分支：本 Skill 只选择专业动作；Environment 的准备、恢复和清理由 selected provider 负责。current knowledge provider 不可用时，不得回退为无 evidence 的直接编辑或伪造 Change。

### 创建并默认准备 Parent Task

用户要求创建Parent、先做总体架构设计与Contribution拆分、准备子任务，或准备到可开发/可启动Child状态时，先按新正式Task路径完成语义治理、完整repository set、Git基线和active Task Record create。todo或用户明确“只创建记录”仍只写Task Record，不准备Environment；纯查看、顶层metadata更新或尚未授权启动也不进入本流程。

active Parent Task Record创建成功不是Parent准备完成。立即把Task ID、canonical Workspace、完整scope，以及authority source map中已经明确的outcome、architecture decisions、Contribution directions/boundaries/dependencies与final acceptance交接给`task-development`；由它持续准备Environment、Development、Parent Plan、Planning Review与planning refresh。不得先向用户报告“Parent已准备好”，也不得要求用户再次说“继续准备”。

信息已经能够形成完整Parent Plan时直接交接并继续；只有缺失内容会实质改变Parent目标、Contribution切分、依赖、边界或最终验收时，才由`task-development`提出最少问题。Task Triage不复制Parent准备循环、不写Parent Plan/Review/Development Result，也不新增跨authority的`parent start`命令。

### 从 Parent 规划项启动独立 Child Task

当用户准备把active Parent推进到首个Child前，先调用`buildr task next <parent-task-id>`，并严格消费它返回的单一next：缺Environment就准备Parent Environment，缺Development就begin，缺Plan就record，Planning Review未current就审查，Review尚未被Development采用就调用公开的`task parent refresh-planning`。只有next为`start-child-contribution`时，才从`eligibleContributions`选择一个Contribution进入Child创建；不要把其他依赖尚未满足的Contribution当成整体阻塞，也不要为未来Child提前准备Environment。

当用户选择eligible Contribution作为独立 Child Task 实施时，再调用`task parent inspect`读取v3响应：从唯一顶层`contributions`取得priority、title、objective、directions、boundaries、`expectation.child`与dependencies，并结合紧凑Planning Review摘要提取该 Child 的稳定 intent、实际Project/Service scope、边界和验收目标。`expectation.child`只描述预期形态，不是已创建或已绑定事实；真实binding只看Child的`boundContributions`。Parent导引只作为Child启动输入。Parent/Child关系不表达Git继承、Change共享或专业状态传播。legacy Parent不得被自动转换或从旧Change/checkbox推断Contribution。

Child Task必须先以`--parent <parent-task-id>`和自身scope创建，且初始不引用Parent Change；`0..N` Change允许此时保持空列表。取得Child自己的matching ready Environment并调用selected `buildr.task-development/v2` provider建立研发事实后，用`task parent bind-child`绑定planned Contributions，才在Child execution root中创建该独立目标自己的窄Change，通过Task Record update添加引用，并刷新Development planning snapshot与适用Planning Review。不得把Parent Change、Parent worktree、branch、Environment Receipt或Development事实复制或继承为Child authority。

如果Child真实依赖Parent尚未交付的代码、文档或其他authority，先在Parent Plan中表达依赖并完成前置Contribution；可以先保留Child意向，但必须延后Child Environment prepare。前置贡献完成正式Finish且进入最新`dev`等canonical baseline后，再从收敛后的baseline准备Child Environment。不得通过从Parent worktree派生Child checkout、复制Parent Environment Receipt或提前共享未归档Change绕过该顺序。

### 新正式 Task 创建前收敛逐 repository 权威基线

只有即将创建 active Task 或把 todo 激活为 active 时执行本门禁；todo create、inspect、已有active继续、纯讨论和只读探索不执行。

1. 以已经解析的完整repository set为输入，按selector固定顺序为每个repository解析integration branch、remote与matching upstream。优先使用Project/Service registry的Git声明；声明缺失时只接受当前符号branch/upstream或用户明确选择形成的唯一事实。无法唯一解析时在tree/history零写入状态返回`blocked`，不得猜测`dev`或复制Workspace目标。
2. 逐个核验真实Git root、当前符号branch恰为已解析integration branch、upstream恰为matching remote ref、remote/ref可读、index与working tree clean，并且没有rebase、merge、cherry-pick等进行中的Git operation。任一事实不成立时在tree/history零写入状态返回`blocked`；不checkout、不stash/autostash、不猜其他branch/remote。
3. 读取optional `buildr.git-operations/v1` binding；在本create分支把ready selected provider作为required。先为全部repositories逐一选择独立`fetch` operation，明确各自remote与integration branch，消费每个Result。任一fetch blocked时不执行尚未开始的rebase，不创建Task，并报告全部已发生的remote-ref effects。
4. 全部fetch成功后重新核验每个local integration branch、matching remote ref与clean状态，再按同一顺序为每个repository明确选择`rebase` operation。本地已对齐、仅落后或含未push且未共享commit都使用同一operation；provider不自行选择merge或push。
5. rebase冲突时，consumer明确授权provider只在pre-state已证明clean时执行有界`rebase --abort`。只有branch、HEAD、index与working tree精确恢复到pre-rebase facts才记为recovered；无论恢复是否成功，本次Task create都是`blocked`。abort失败或恢复不可证明时保留现场。已经在其他repository成功的fetch/rebase不反向回滚，必须作为部分effects报告。
6. 任一rebase返回`treeChanged: true`时，按产品入口Buildr Skill的workspace transition约束，对相应Buildr Workspace执行当前Agent的check；Doctor或必要收敛未ready时不创建Task。若tree前进来自matching upstream上的协作者提交且当前会话不存在绑定同一Workspace、Task、run与delivered ref的matching Formal Finish Result，只能把它归类为普通Workspace update：本地没有协作者Task是正常事实，不得因此查找、恢复或启动`buildr-self-bootstrap-sync`。Doctor仅指向当前Agent managed workspace/runtime projection stale时，将现有用户授权或一次明确sync确认交给产品入口Buildr Skill执行`buildr sync <agent> --target <workspace-root>`并消费最终Doctor；存在非sync blocker时按对应authority停止或处理，不用一次sync掩盖。
7. 只有完整repository set的fetch、rebase、恢复检查与适用transition check全部成功，才调用selected `buildr.task-record/v2` provider的active `create`或`activate`。任一门禁blocked时todo保持不变。Task Record Application、Buildr Web与Task Environment不获得任何Git mutation或本门禁状态authority。

上述Workspace update分类只组合本次Git Result、post-transition Doctor与当前会话已有的matching Formal Finish Result，不按commit author推断ownership，也不建立持久状态。只有真实matching Finish Result才能把同一run交给self-bootstrap；普通workspace sync不创建Task、Environment、Verification、Candidate、Finish Result或self-bootstrap evidence。

选择 `change-flow` 时，先确保正式 Task Record，再完成执行位置判断并使用适用的 `openspec-*` Skill。首次采用、状态实质变化、暂停、完成或用户询问时，从 CLI 刷新并报告 change id、resolved path、action、status、progress 和 next action/blocker；未创建时只写 `planned`，不猜测路径或进度。Buildr 自有 artifacts 和用户说明正文使用中文；命令、路径、标识符、协议字段与 OpenSpec 格式关键字可保留英文。

实现型任务按共享实现区域、验证入口或失败影响面分组。直接工作可以在已确认的真实Git与owned scope中继续，不因Formal Task或Environment缺失而停止；选择Buildr受管正式证据路径时，先取得matching ready Environment，再在写入该路径的首个 proposal、方案或实现内容前调用 selected `buildr.task-development/v2` provider 的 `begin` 建立研发聚合事实。后续专业 planning artifact 变化时更新 planning snapshot。需要设计测试框架、划分测试边界、编排场景或为实现开发测试时使用 `project-testing`；它不维护 capability declaration 或 Result。内容、测试和 review 修订完成后仍由 Development 收敛 current knowledge/Change、观察 stable Content Target、形成 policy，并调用 selected `buildr.task-verification/v3` provider 维护 current Task Result，再继续 Candidate、Completion Review、decision 与 handoff。triage 不接管这些 provider，也不预设 minimal/affected/candidate 层级；Development provider 在该受管分支不 ready 时只阻塞受管证据，不撤销其他已获授权的直接工作。

## 4. 输出契约

```text
任务分流：
- 语义治理：code-only / spec-maintenance / change-flow / blocked
- 执行形态：implementation / metadata-only / unknown
- Repository set：<selectors 或 unresolved>
- Git 基线：converged / none / blocked（仅新正式Task create；包含每个repository的integration branch/upstream与部分effects）
- Task Record：create / inspect / none / blocked
- Task Environment：prepare / inspect / none / blocked
- 事实依据：<最小 authority/evidence>
- 未决事项：<none 或冲突/授权问题>
- 下一动作：<selected capability/provider action 或用户决定>
```

只有选中 OpenSpec 时追加对应状态。任务进度直接使用 Task Record、Parent/Child、各专业公开 read model、Buildr Web 与对话表达；不得把 readiness、planned identity、文件存在或单次 finding 冒充行为成功。

## Guardrails

- 不为过去事实补造 Change 历史，不把 current knowledge 变成第二套规范。
- 不在正式 Task 的首次持久交付写入后才补做 Task Record 或 Task Environment 决策。
- 不把创建前 Git 基线门禁塞进 Task Record Application、Buildr Web 或 Task Environment，也不把多仓库操作伪装为原子 transaction。
- 不使用未经 authority 或 CLI 确认的路径、状态、进度和完成结论。
- 不把一次集中验证解释为覆盖尚未执行、stale 或存在 coverage gap 的适用 delivery-required capability。
