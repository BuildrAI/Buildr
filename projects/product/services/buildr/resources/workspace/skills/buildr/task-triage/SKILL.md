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

首次修改 proposal、Skill、代码、测试或当前知识前，从直接相关的 canonical specs、current knowledge、实现、测试与 registries 建立一次有界 authority source map。该 map 只用于当前 Agent 工作上下文，不写入 Task Record、sidecar 或其他产品 authority；后续只有 scope、authority 或相关事实变化时才增量刷新，不反复全量扫描。

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

该轴独立于语义治理。Formal Task Record本身不是编辑、构建或有界测试的通用工作许可：用户授权、repository/ref、owned scope与副作用边界均明确时，Agent可以直接工作，但不得把该路径冒充ready Environment、Formal Verification或cleanup事实。选择Buildr-managed checkout、Preparation、runtime projection、持久资源、正式环境证据或cleanup时，才必须根据Task完整Project/Service scope与Project `preparation.yml`形成Environment Plan并取得ready；`metadata-only`受管执行可以使用共享执行根。

## 3. 条件化交接

已有或刚创建的active Formal Task先`task inspect`核对目标、scope与current record identity。需要Buildr-managed checkout、Preparation、runtime projection、Task-owned资源、正式环境证据或cleanup authority时，使用`task environment inspect|prepare`取得matching执行根与retained controller；不需要这些能力的直接工作不补造Environment。

按用户目标和当前事实渐进装配专业上下文：执行当前动作前只读取相应Skill、binding、contract与直接authority，Review、Verification、OpenSpec、Parent管理和任务收尾只在真实命中时加载。不得为发现未来阶段运行Doctor full或预读完整专业Result；provider不ready时只阻塞或降级对应分支，保留其他已确认结论。

用户已经授权实现时，先选择直接工作或Buildr受管执行路径。直接工作在真实Git、文件ownership与副作用边界内立即推进并如实报告证据范围；需要OpenSpec managed flow、Formal Verification、Task-owned资源或cleanup时，取得matching ready Environment后立即进入proposal或实现。

| 分支 | Capability / 动作 | 必要输入与成功证据 | 失败处理 |
|---|---|---|---|
| 新正式 Task 的 Git 基线 | `buildr.git-operations/v1` 的独立 `fetch` 与 `rebase` | 完整 repository set 分别证明current integration branch、matching upstream与clean状态；每个 operation 返回before/after、effects与current facts，适用Workspace transition check ready | 任一目标解析、前置事实、provider、fetch、rebase、冲突恢复或Doctor blocked时不调用Task Record `create`；报告全部部分effects，不换策略 |
| 待办意向 | `buildr.task-record/v2` 的 `create --status todo` | 用户已接受但尚未启动的意向、stable ID、title、intent、scope与可选复盘来源；只返回SQLite record/effects | 不运行Git基线，不创建Environment、Change或专业placeholder |
| 正式持久交付 | `buildr.task-record/v2` 的 active `create`、todo `activate` 或 `inspect` | stable Task ID、title、intent、canonical Workspace 与真实 scope/Change；首次执行写入前返回 current active record | provider或Git门禁blocked时停止正式交付写入；已有active inspect不重复门禁 |
| 正式执行位置 | `buildr.task-environment/v1` 的 Plan `record/inspect` 与 Environment `prepare/inspect` | Task ID、canonical Workspace、完整 Task Project/Service scope、Project `preparation.yml`及Agent选择的Recipe；首次受管效果前取得`ready`、实际execution roots、validation root和执行CLI | Declaration/Plan缺失或scope不完整时只阻塞消费Environment authority的动作；不猜技术栈，不回退到cwd或旧Receipt |
| 独立 current knowledge `spec-maintenance` | `buildr.current-knowledge-maintenance/v2` 的 `maintain` | Project、targets、fact sources、授权、tree identity；返回 `aligned|updated|not-applicable` | `unresolved` 报 authority 冲突；`change-required` 重新进入 `change-flow` |
正式持久交付包括代码、文档、配置、Rule、Skill、OpenSpec Change、验证声明或其他准备交付的持久变化。已有 Task Record 或 Buildr Web 已创建时先 inspect 并核对 intent/scope，不重复 create，也不重新执行创建前 Git 基线门禁；本次动作仅维护已有生命周期 metadata 时不递归创建新 Task，也不要求重新准备已清理的 Environment。Task Record provider 不可用时不得手写 YAML 代替。其他 provider 不可用时只阻塞对应分支：本 Skill 只选择专业动作；Environment 的准备、恢复和清理由 selected provider 负责。current knowledge provider 不可用时，不得回退为无 evidence 的直接编辑或伪造 Change。

### 父子任务

创建、准备或拆分父任务时使用 `task-manager` 的轻量父子管理方法，记录整体目标并持续整理当前计划。协调不消费环境、研发、专用贡献或审查采用事实；只有任务实际需要受管执行时才使用对应能力。子任务依据独立目标、范围和真实前置成果创建，不继承父任务环境或规范变化。父任务完成必须取得明确指向它的用户授权，不能从子任务完成或收尾推导。

### 新正式 Task 创建前收敛逐 repository 权威基线

只有即将创建 active Task 或把 todo 激活为 active 时执行本门禁；todo create、inspect、已有active继续、纯讨论和只读探索不执行。

1. 以已经解析的完整repository set为输入，按selector固定顺序为每个repository解析integration branch、remote与matching upstream。优先使用Project/Service registry的Git声明；声明缺失时只接受当前符号branch/upstream或用户明确选择形成的唯一事实。无法唯一解析时在tree/history零写入状态返回`blocked`，不得猜测`dev`或复制Workspace目标。
2. 逐个核验真实Git root、当前符号branch恰为已解析integration branch、upstream恰为matching remote ref、remote/ref可读、index与working tree clean，并且没有rebase、merge、cherry-pick等进行中的Git operation。任一事实不成立时在tree/history零写入状态返回`blocked`；不checkout、不stash/autostash、不猜其他branch/remote。
3. 读取optional `buildr.git-operations/v1` binding；在本create分支把ready selected provider作为required。先为全部repositories逐一选择独立`fetch` operation，明确各自remote与integration branch，消费每个Result。任一fetch blocked时不执行尚未开始的rebase，不创建Task，并报告全部已发生的remote-ref effects。
4. 全部fetch成功后重新核验每个local integration branch、matching remote ref与clean状态，再按同一顺序为每个repository明确选择`rebase` operation。本地已对齐、仅落后或含未push且未共享commit都使用同一operation；provider不自行选择merge或push。
5. rebase冲突时，consumer明确授权provider只在pre-state已证明clean时执行有界`rebase --abort`。只有branch、HEAD、index与working tree精确恢复到pre-rebase facts才记为recovered；无论恢复是否成功，本次Task create都是`blocked`。abort失败或恢复不可证明时保留现场。已经在其他repository成功的fetch/rebase不反向回滚，必须作为部分effects报告。
6. 任一rebase返回`treeChanged: true`时，按产品入口Buildr Skill的workspace transition约束，对相应Buildr Workspace执行当前Agent的check；Doctor或必要收敛未ready时不创建Task。matching upstream上的协作者提交属于普通Workspace update；本地没有协作者Task是正常事实，不得据此补造历史任务或交付记录。Doctor仅指向当前Agent managed workspace/runtime projection stale时，将现有用户授权或一次明确sync确认交给产品入口Buildr Skill执行`buildr sync <agent> --target <workspace-root>`并消费最终Doctor；存在非sync blocker时按对应authority停止或处理。
7. 只有完整repository set的fetch、rebase、恢复检查与适用transition check全部成功，才调用selected `buildr.task-record/v2` provider的active `create`或`activate`。任一门禁blocked时todo保持不变。Task Record Application、Buildr Web与Task Environment不获得任何Git mutation或本门禁状态authority。

上述Workspace update分类只组合本次Git Result与post-transition Doctor，不按commit author推断ownership，也不建立持久状态。普通workspace sync不创建Task、Environment、Verification或self-bootstrap evidence。

选择 `change-flow` 时，先确保正式 Task Record，再完成执行位置判断并使用适用的 `openspec-*` Skill。首次采用、状态实质变化、暂停、完成或用户询问时，从 CLI 刷新并报告 change id、resolved path、action、status、progress 和 next action/blocker；未创建时只写 `planned`，不猜测路径或进度。Buildr 自有 artifacts 和用户说明正文使用中文；命令、路径、标识符、协议字段与 OpenSpec 格式关键字可保留英文。

实现型任务按共享实现区域、验证入口或失败影响面分组。直接工作可以在已确认的真实Git与owned scope中继续，不因Formal Task或Environment缺失而停止；选择Buildr受管正式证据路径时，先取得matching ready Environment。Agent直接依据目标、OpenSpec、Git、代码、文件和专业结果推进，不创建研发聚合事实或planning snapshot。需要设计测试框架、划分测试边界、编排场景或为实现开发测试时使用`project-testing`。开发中的测试由Agent直接调用项目工具；开发完成后独立使用selected `buildr.task-verification/v4` provider，只保存有意义的Task验证报告。triage不把验证报告变成Task完成门禁。

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

只有选中 OpenSpec 时追加对应状态。任务进度直接使用 Task Record、Parent/Child、各专业公开 read model、Buildr Web 与对话表达；不得把 readiness、文件存在或单次 finding 冒充行为成功。

## Guardrails

- 不为过去事实补造 Change 历史，不把 current knowledge 变成第二套规范。
- 不在正式 Task 的首次持久交付写入后才补做 Task Record 或 Task Environment 决策。
- 不把创建前 Git 基线门禁塞进 Task Record Application、Buildr Web 或 Task Environment，也不把多仓库操作伪装为原子 transaction。
- 不使用未经 authority 或 CLI 确认的路径、状态、进度和完成结论。
- 不把一次集中验证解释为覆盖尚未执行、stale 或存在 coverage gap 的适用 delivery-required capability。
