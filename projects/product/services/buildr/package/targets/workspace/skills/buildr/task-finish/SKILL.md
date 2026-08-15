---
name: task-finish
description: 用户要求已有 active formal Task 的“收尾”或交付 current formal Development handoff 时使用；在隔离交付载体（Delivery Carrier）上机械复用或进行交付适配（Delivery Adaptation）、推进 retained target 并清理 Environment，只有 Development applicability stale 才返回 Task Development。
---

# Task Finish

本 Skill 只处理 active formal Task，提供 `buildr.task-finish/v1` 入口；不编排 Development/Review/Verification，不写 Receipt。没有 active Task 时用户说“收尾”，转由直接 Git 路径执行；不得创建临时 Task，也不把 Git Result 冒充 Formal Finish。

## 调用前

1. 明确正式 Task ID 与 canonical Workspace。
2. 用户排除 push、install 或 cleanup 而改变交付语义时停止。
3. 轻量确认任务分支贡献已提交、本机主工作区已对齐目标远端。未提交或落后时先说明并等待处理或明确继续；不得做成新的入口缺口码。
4. 不要在调用产品前自行链式做 Environment → handoff → target/remote 的 fail-fast；入口聚合与模块分类由产品一次完成。
5. 根据最终交付内容与Workspace、Project、Service、repository约定形成完整commit message。subject必须描述内容，优先使用简洁Conventional Commits；Task ID由产品写入trailer，不得使用“交付 + Task ID”占位主题。调用前向用户展示subject，正文存在时一并展示。
6. 直接启动 canonical `buildr task finish run`；若返回 `task_finish.entry_gaps`，按 `error.details.gaps` 的 `development` / `environment` / `delivery` 完整转述，不得只报第一项。
7. 存在 `development` 缺口（或 `nextWorkflow: task-development`）时路由 `task-development`；Finish 不补齐 Change/Verification/Completion/handoff 事实。仅工作区Task也必须先有current Candidate、Completion Review、proceed decision与Development handoff；Finish只消费handoff，不解释workspace gap或重新接受风险。
   - Child承担Parent Contribution时，handoff还必须包含与current Parent Plan和planned binding一致的Contribution Handoff。
   - Parent采用Parent Plan时，必须已记录current plan identity的显式最终集成验收；Child全部完成本身不满足该条件。

## 执行

从 canonical retained Workspace 的可信 Environment Manager 调用：

```bash
buildr task finish run --task <task-id> --commit-message '<semantic-message>' --target <canonical-workspace> --detail compact --json
```

直接使用runtime投射到本Skill的精确`buildr.task-finish/v1` capability binding。启动后使用宿主支持的有界长等待消费同一进程/session，直到completed、failed、input-required或当前等待窗口到期；窗口只决定Agent何时恢复控制，不是Finish业务timeout。若仍为running，继续长等待同一session，不启动第二个Finish、不高频读取普通输出，也不承诺固定两次调用或写死45/60秒。

产品在创建 run 前一次聚合 Environment / Development / 交付入口观察；通过后固定执行：

```text
preflight → prepare → verify → deliver → cleanup
```

五阶段由产品连续执行，Agent不编排阶段、补evidence或设计recovery。

完整message只在首次run冻结；resume不得覆盖。新handoff以新message创建新run。旧run仅在preflight且无交付副作用时失效，否则保留现场并返回identity conflict。

首次run或resume先预留独立`task-finish/finish-diagnostics` Execution Record；容量不足不启动五阶段。record只保留受控诊断，carrier、lease、resume与cleanup仍由Finish current管理。

- `preflight`核对current handoff、Environment、carrier adapter与retained target；各阶段和resume都精确核对run冻结的handoff、Candidate、generation与Content Target。
- `prepare`在隔离交付载体（Delivery Carrier）把任务贡献（Task Contribution）机械应用到最新交付基线（Delivery Baseline）。clean apply记录`deterministic-reuse`；Git conflict保留carrier并返回`delivery-adaptation-required`，不改原Task worktree。
- Agent只在carrier完成交付适配（Delivery Adaptation）。非零适配HEAD必须保持冻结message；若baseline已满足任务且正确适配为零tree delta，保持clean carrier并在matching resume传入`--accept-zero-delta-adaptation`，不得创建空提交或无关差异。resume仍执行bounded compatibility checks，`formalVerificationExecutions` 必须为 `0`。
- `verify` 对clean apply记录确定性Git identity；对适配记录`agent-reviewed-delivery-adaptation`，不得描述为Buildr已证明语义等价。Candidate identity/generation保持不变。
- `deliver`只做fast-forward、push/回读、按冻结Task Contribution选择的runtime activation与Agent Doctor；Doctor失败保留现场并停止cleanup。通用executor不sync、不安装CLI/Buildr Web或接受任意命令。
- render不得产生tracked/staged delta。普通交付的`remoteAfterRef`与`finalRemoteRef`都等于carrier；仅当最新target可证明完整包含carrier时，记录`targetDisposition: already-contained`、原carrier ref与最新后代final remote ref。
- `cleanup` 把 delivery identity 交给 Task Environment；不直接删除 provider 状态或写第二份 Environment 结论。

target前进时先证明carrier ancestry及changed paths；完整包含才跳过apply/push并继续Doctor与cleanup。恢复不增加 Candidate generation或重跑formal Verification/Completion Review；原Task source/handoff真实stale时才返回`nextWorkflow: task-development`。路径不重叠都不等于语义安全；不得手写token、recovery manifest或claimed semantic equivalence。

恢复命令：

```bash
buildr task finish run --task <task-id> --run <run-id> --resume <product-token> [--accept-zero-delta-adaptation] --target <canonical-workspace> --detail compact --json
```

只读查看：

```bash
buildr task finish inspect --run <run-id> --target <canonical-workspace> --detail compact --json
```
abandon 后未交付隔离载体：对既有 run 加 `--release-occupancy`；不得 `git worktree remove` 或手删 `.buildr/transient/task-finish/carriers/`，也不作废已推送交付。
## 禁止事项

Finish不改变Candidate/generation、Development Receipt、Change或原Task worktree，不发起 Task Verification/Completion Review，也不决定风险。Finish不运行OpenSpec Converge。两种reuse mode都复用handoff；clean apply或resume不等于语义安全。仅当既有run在preflight/prepare发生已记录、无副作用的Product provider exception时，用户才可明确授权`--bootstrap-recovery`；它只让retained Application从current ready Environment和current Development handoff共同确认的clean committed checkout加载run-owned capsule provider。retained Application、SQLite、Execution Record及状态机仍是唯一writer；不得传source/module/manifest/tarball、运行candidate CLI、临时安装或新建run。入口、registry、Application、repository或migration损坏不适用。

## 完成标准

- 五阶段全部 passed/not-applicable；
- Result引用Development handoff、Candidate/generation、Content Target、Task Contribution、Delivery Baseline和Delivery Carrier；
- Result标记`deterministic-reuse`或`agent-reviewed-delivery-adaptation`，后者不声称Buildr证明语义等价；
- carrier equivalence 为 current，target 仅 fast-forward，Environment cleanup 完成；
- Git delivery完成remote回读；普通路径after/final ref等于carrier，`already-contained`保留适用的逐路径或零差异Agent review/baseline/ref/activation paths证明；
- `agentProviderCompletions = 0`、`manualRecoveryManifests = 0`、`formalVerificationExecutions = 0`。
- bootstrap recovery还须证明同一run/capsule、原failure、source commit/tree/provider digest及cleanup后的authority revocation；`bootstrapRecoveryExecutions = 1`。

`run`结果的additive `executionRecord`必须可解释：`retained`表示本invocation正文已保留；`attention`表示record或diagnostics cleanup需owner后续处理，但不得据此回滚、改写或重跑已经成立的Finish delivery/cleanup/Task终态；`blocked`表示容量门禁在五阶段前停止；invalid或complete no-op为`not-opened`。`task finish inspect`只读Finish current/terminal，不列举records。complete 后先报告终态，再询问是否进行“任务复盘”：当前关注 Agent 耗时、Token、重复尝试和人机协作，Token 不可得可缺失。仅用户同意后路由 `task-retrospective`；blocked/failed 不提示，且复盘不影响终态。
