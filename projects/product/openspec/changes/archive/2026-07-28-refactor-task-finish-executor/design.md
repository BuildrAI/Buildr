## Context

Task Finish 从“开发完成后的固定结尾 workflow”逐步演化成了持久化 checkpoint、action registry、attempt/lease、手工 evidence completion、typed recovery、repair authorization 和两阶段 cleanup 的组合。当前实现将安全事实拆成 13 个步骤，`task-finish-run.mjs` 超过 1100 行；正常路径仍可能在 provider handoff、输入补齐、诊断解析和恢复 manifest 之间多次返回 Agent。最近多轮 change 的设计都把“不重写状态机”作为约束，因此每次只把一个 handoff 下沉为 handler，复杂度与兼容面继续增长。

本次设计把成功标准重新设为用户最初目标：Task Finish 是产品持有的确定性收尾执行器，Agent 只负责理解“要收尾”、披露授权并处理真正的语义失败。安全门禁继续存在，但不再各自成为公共 workflow step。

## Goals / Non-Goals

**Goals:**

- 正常路径由一次 `buildr task finish run` 完成，执行器内部固定为 `preflight → prepare → verify → deliver → cleanup`。
- 所有廉价、无副作用检查在 `preflight` 一次聚合；同一输入不再逐个暴露可同时发现的问题。
- 所有会改变候选的动作在 `prepare` 收敛到固定点并冻结唯一 candidate identity；冻结后不允许 repair 或新的 delivery mutation。
- 对冻结候选最多执行一次 required assurance；失败返回具体 check/stage/diagnostic 并结束当前 run。
- 把 finish-ready candidate 设为进入交付的前置契约；Task Finish 发现的任何产品缺陷都归因于研发、审查或前序测试验证未完成，不得在收尾模块内修复。
- 产品根据真实状态生成 resume token、失效边界和下一动作；Agent 不提供 evidence、fingerprint、execution plan、attempt token 或 recovery JSON。
- 五阶段结果以动作观测、CLI 调用数、正式验证次数、Agent handoff、wall-clock 和 failure projection 作为正式证据。
- 保留并简化并发 ref fencing、candidate identity、目标竞态、retained runtime、安装和 cleanup 安全边界。

**Non-Goals:**

- 不让 Buildr 解决 OpenSpec 语义冲突、Git 内容冲突、测试失败或业务修复方案。
- 不把产品缺陷修复、审查返工、测试补齐或重新验证计入收尾动作与收尾耗时。
- 不自动 force push、删除远端任务分支、丢弃 dirty worktree、终止未知进程或扩大既有授权。
- 不把 Task Finish 变成通用任务引擎、通用 shell runner 或 provider 编排框架。
- 当前实现直接替换旧状态机，不增加并行版本目录、兼容 reader、转换器或迁移逻辑。

## Decisions

### 1. 用五阶段执行器替换 step/action registry

新增 `task-finish-executor.mjs`，顶层只持有五个阶段。每个阶段内部使用固定 product actions，并将动作观测写入阶段的 `checks` 或 `operations`，而不是把每个动作提升为可由 Agent completion 的状态节点：

```text
preflight
  context probe + cheap policy checks + convergence plan + target observation
prepare
  deterministic convergence + generated assets + commit/rebase + freeze
verify
  one required assurance on frozen candidate
deliver
  fenced ref transition + retained convergence + affected entrypoint install
cleanup
  durable completion + task-owned local cleanup
```

阶段只有 `pending|running|passed|blocked|failed|not-applicable`。`blocked` 表示外部条件或授权补齐后可在同一 candidate 上恢复，`failed` 表示语义冲突、候选缺陷或身份不可证明，必须结束 Finish 并回到研发流程。选择阶段而不是现有 13-step DAG，是因为收尾顺序本来固定；通用依赖图、action kind 和 caller completion 为不存在的可变编排增加了状态空间。

### 2. Preflight 是无副作用聚合器

`preflight` 并行或顺序执行全部已知廉价检查，但在收集完整结果前不早退：

- task environment receipt、membership、runtime identity 与 receipt-bound CLI 实际 `--version`/context probe；
- change/task 状态、knowledge impact、OpenSpec delta strict validation 与 convergence pure plan；
- Git branch/HEAD/dirty/untracked/target/upstream/remote observation；
- Project verification policy、required assurance 和资源授权可解析性；
- retained root、安装影响与 cleanup ownership 的可证明性。

只要任一 error，整个阶段零 delivery mutation，并一次返回按 check 分组的 findings。warning 不覆盖 primary error。Asset review 不再属于执行引擎；Task Finish Skill 在存在 observation 时先完成独立 provider decision，没有 observation 时不增加 CLI 往返。

选择聚合而不是 fail-fast，是因为这些检查成本低且相互独立，批量结果能直接消除“修一个、再跑、再暴露一个”的循环。

### 3. Prepare 只允许有限 mutation，并以 fixed point freeze 结束

`prepare` 固定执行：OpenSpec convergence、允许的 runtime/source generation、候选提交、目标 fetch/rebase、rebase 后生成物复核与必要的第二个纯机械提交。执行器随后要求所有 repository clean，计算包含每仓 HEAD/tree、change archive、canonical specs、runtime projection 和目标 observation 的 `candidateIdentity`，写入 freeze record。

freeze 后任何候选路径变化、HEAD 改变、目标 convergence 重新产生内容 delta 或 runtime projection 漂移都会使当前 run `failed: candidate-changed-after-freeze`，而不是回到 prepare 或接受调用方 recovery。这样正式验证始终只证明一个不可变候选。

### 4. Verification failure 离开 Finish

`verify` 从 Project policy 解析最低充分 required assurance，并只调用一次正式产品 verification executor。成功 evidence 必须匹配 frozen candidate identity。失败 summary 必须投射真实 failed stage/check、exit/status、bounded findings、diagnostic reference 和 verifier wall-clock。

当前 run 在 verification failure 或任一阶段识别到产品缺陷后标记 terminal `failed`，返回 `failureClass: upstream-candidate-defect`、`nextWorkflow: task-development` 与研发所需的 task/change/failure identity；不得在同一 run 内接受 repair authorization、implementation recovery 或 re-verification。修复、审查与重新验证属于研发 workflow，完成并形成新的 finish-ready candidate 后再启动 Finish。

选择退出 Finish 而不是可恢复 repair，是因为 repair 是研发、审查和测试验证行为；让它进入 Finish 不但会把收尾再次变成无界任务循环，也会掩盖上游质量门禁没有产生 finish-ready candidate 的事实。

### 5. Resume 由产品观察生成

current run store 保存阶段输入/输出 identity、真实 command observations、target ref observation、freeze record 和 completion。`run` 每次启动先读取已有 current run，并用 product observer 分类：

- 输入未变且阶段已通过：复用；
- transient external condition 已解除且 candidate 未变：从最早 blocked 阶段恢复；
- candidate 或语义输入改变：当前 run terminal，回到研发流程重新形成候选；
- 状态无法证明：fail closed，并返回产品生成的 `resumeToken` 与 diagnostic，不接受调用方 manifest。

`resumeToken` 是对 run、candidate、blocked phase、observed state 和允许 transition 的签名摘要，不携带任意命令或 evidence。canonical 命令仍是 `run --resume <token>`；若 token 可从 task/change 唯一解析，Agent 可以直接重复同一 `run` 而无需传 token。

### 6. Deliver 与 cleanup 保持窄授权

`deliver` 在短 target lease 内重新观察 expected target ref，只允许 fast-forward/等价 candidate transition 和普通 push。外部 target 前进返回 `blocked: target-race`；内容冲突或非 fast-forward 必须退出 Finish 并回到研发流程。push 成功后才在 retained checkout 执行 impact-aware doctor/sync 和 receipt-bound CLI/Local App 安装。

`cleanup` 先在 retained root 写 durable completion，再清理 verification transient evidence、task-owned process/preview 和本地 task environment。删除动作由 retained CLI 负责，执行器不得从即将删除的 checkout加载 finalize 代码。无法证明 owner 或仍有进程时返回 resumable blocked，并保留已交付事实；不得重跑 verify/deliver。

### 7. 客户端直接替换旧实现

旧 `actions|advance|resume|renew|recover|cleanup-prepare|cleanup-finalize`、状态机、reader 和 executor 全部从当前客户端删除。新执行器继续使用唯一 canonical `runs`、`completed` 和 lease namespace，不创建 `runs-v2`、`completed-v2` 或其他并行协议目录。

旧客户端继续运行其随包实现；用户升级后，当前实现直接替换旧实现。canonical store 中不符合当前五阶段 shape 的旧 run 不可恢复：自动选择时跳过，显式 inspect 时 fail closed。Buildr 不为旧状态维护兼容、归档、转换或阶段映射逻辑。

### 8. 模块边界按阶段和领域服务拆分

Task Finish 只拥有阶段编排、run store、freeze/resume identity 和结果投射。OpenSpec convergence、verification、Git observation/transition、runtime sync/install 与 worktree cleanup 继续由各自 application service 提供确定性函数；它们不再通过 Agent provider completion 反向进入 run。Capability contract 约束的是稳定输入、授权、effects 和 result evidence，不把 Skill 调用过程建模成产品 action registry。

## Risks / Trade-offs

- [重写会影响已有 CLI/fixture] → 当前客户端删除旧入口与 parser；用拒绝旧 action、拒绝旧 run shape 和真实 journey 测试覆盖边界。
- [聚合 preflight 可能稍增首次检查时间] → 只允许廉价无副作用检查，并记录每项耗时；避免多轮 CLI 启动的总成本更低。
- [prepare 中 rebase 后可能再次产生 generated delta] → 只允许白名单机械生成物并形成最后提交；其他变化退出 Finish 并回到研发流程。
- [一次验证失败后退出 Finish 看起来不如同 run 恢复灵活] → 换取明确的开发/收尾边界和可信候选证据；后续研发可以引用前一 failure identity，但不继承 passed assurance。
- [cleanup 在 retained checkout 执行增加跨 root 实现] → 所有 retained root 与 CLI identity 来自 receipt，finalizer 使用显式绝对入口并有 integration/push completion 前置。
- [移除 action registry 可能失去扩展点] → 固定收尾不需要通用扩展；新领域动作只有在五阶段语义内且具备稳定 product service 时才能进入对应阶段。

## Direct Replacement Plan

1. 直接替换现有 run schema、canonical store 内的当前 run shape、phase observer 和只读 preflight，不建立并行版本目录。
2. 接入 prepare/freeze 与一次 verification，在 fixture 中证明失败终止并回到研发流程。
3. 接入 deliver/retained/cleanup，完成单命令真实 journey 和并发 target-race 恢复。
4. 直接更新 CLI、Skill、contract、帮助与 current knowledge，并删除旧子命令、状态机与 reader。
5. 删除 action registry、caller evidence/recovery 与 repair authorization 的全部产品路径和测试。
6. 运行 affected 与最终 Candidate，记录正常路径 CLI=1、formal=1、manual completion=0、manual recovery=0 的验收证据。

回滚通过安装上一个 Buildr Client 版本完成，当前客户端不维护双协议路由或版本化 run store。

## Open Questions

无。Asset review 继续作为任务资产审查的独立 Skill lifecycle；存在待人工决定的 observation 时由 Task Finish Skill 在调用执行器前阻塞，不再进入产品 Finish run。
