## Context

现有 release owner 已分别覆盖 selection、Candidate aggregate/唯一 artifact、release→main、Release Context/readiness、protected transaction、hosted evidence、dev provenance reconciliation、Git closeout、Task Record、Task Environment 与 Doctor。`release-lifecycle.mjs` 只从这些 current facts 投射阶段；`buildr-release` 仍由 Agent逐段调用 owner并手工组合 lifecycle JSON。rc.23 证明该边界保证了安全，但 merge 后 context 组装、授权后重复调用、Publication 后多 owner closeout 和阶段耗时反推仍产生可避免成本。

本设计面向 Buildr 维护者与 Agent，不增加前端界面。两个前置任务分别稳定 timeout harness 和 Candidate failed-shard retry；本任务先实现通用 attempt/timeline 模型及编排 seam，完整真实多 attempt 验收延后到二者交付后。

## Goals / Non-Goals

**Goals:**

- 用一个 release orchestration runner 表达 `prepare-dispatch`、`dispatch` 与 `closeout` 三个可恢复动作。
- 复用既有 owner 的公开函数或 retained controller CLI，保留各自校验、effects 与失败恢复身份。
- 把 current owner/GitHub facts收敛成 closed、可移植、可验证的 Release Phase Timeline。
- 在 partial failure 后返回已成立 effects 与唯一 resume action，不回滚 Publication、Task completion 或已完成 cleanup。
- 默认输出 compact summary，完整 context、timeline 与 owner results 只在 full output/evidence中提供。

**Non-Goals:**

- 不自动取得或推断 publication、carrier/selection cleanup、正式 release ref删除等授权。
- 不建立 release SQLite row、Task Record新字段、通用 workflow engine、scheduler 或跨 owner transaction。
- 不改变 Candidate shard retry实现；只消费其最终提供的 run/attempt/evidence facts。
- 不把人类决定时间混入机器执行耗时，也不为历史 release 补造缺失时间戳。

## Decisions

### 1. 三动作编排器，而不是一个不可中断命令

新增 `release-orchestration-runner.mjs`：

- `prepare-dispatch` 读取 merge后的 current owner facts，调用现有 transaction readiness，返回 frozen context digest、`awaiting-publication-authorization` 与 approval request，`effects: []`。
- `dispatch` 必须同时接收维护者显式授权和 expected context digest，重新构造或验证 current context；digest一致后调用既有 protected transaction runner。历史 readiness 或 Task 状态不能替代授权。
- `closeout` 按 hosted evidence inspect → dev provenance reconciliation → release Git closeout → lifecycle closed检查 → retained Task no-change completion → retained Environment cleanup → retained Doctor 的顺序推进。

选择三个动作是为了让维护者授权继续成为明确暂停点，并让 Publication 后失败只恢复未完成 owner。替代方案是把 readiness 到 closeout 作为一个长命令等待授权；这会模糊授权边界、增加断连恢复难度，因此不采用。

### 2. 编排器只组合 owner Result，不成为综合 authority

release selection、transaction、Git convergence、Task Record、Environment 与 Doctor继续由原 owner判断成功。编排结果保存/返回每个 step 的 owner、operation、status、identity、effects 与 next action；它不得接受 caller 的 `passed` 布尔值或拼接聊天摘要。

Task complete、Environment cleanup 与 Doctor必须通过 Environment Receipt 指向的 retained controller invocation执行。编排器可以在当前进程中读取 portable owner facts，但不得让 candidate controller直接写 canonical Task/Environment。

替代方案是新增 release lifecycle Application/SQLite writer；现有 owner facts已经足够恢复，这会造成第二状态权威，因此不采用。

### 3. Closeout 使用前向恢复，不伪造跨 owner 原子性

每一步前重新读取 current facts；已通过且identity一致的步骤返回 `reused`，未通过的步骤才执行。任一步 blocked 时停止后续步骤，保留已发生effects并返回该 owner 的 recovery identity/next action。

Task no-change completion只在 Publication、reconciliation、release Git closeout和lifecycle `closed`均成立后执行。Task完成后Environment cleanup或Doctor失败时，Task保持terminal，resume只继续 cleanup/Doctor，不重新Publication、reconciliation、Git cleanup或Task complete。

### 4. Timeline 是closed投影，不是日志或新的时钟authority

新增 `buildr.release-phase-timeline/v1`。每个阶段条目包含稳定 `id`、phase、`startedAt`/`finishedAt`（可空）、duration（两端均可证明时派生）、status、owner、owner identity、run/attempt和wait classification。允许的等待类型为 `machine-execution`、`platform-queue`、`environment-approval`、`human-decision`；缺少边界时保存 `unknown`，不估算。

Timeline来源仅限 Task/Git/PR/GitHub run/attempt、release owner Result和Environment/Doctor observed time。Candidate attempt按 `runId + runAttempt`区分；复用成功 shard时引用其原 evidence attempt，新 attempt只记录实际重跑范围和最终 aggregate identity。Timeline identity对规范化阶段数组求digest。

替代方案是把阶段时间写入 Task Record或新增Execution Record owner；release facts已有稳定时间来源，先提供portable projection更符合宽而薄原则。

### 5. 前置任务只阻塞联合验收，不阻塞主体实现

本 Change 的 unit/integration fixtures覆盖多 attempt、复用 evidence和partial closeout。实现及 focused/affected开发反馈可以先完成。直到 `stabilize-remote-skill-timeout-test` 与 `support-candidate-failed-shard-retry` 均交付，不归档本 Change、不形成最终稳定 Content Target，也不进入Formal Verification/Candidate/Completion/Finish。

## Risks / Trade-offs

- [跨 owner 部分成功无法回滚] → 每步重验current identity，返回精确effects与resume owner；禁止把组合调用描述为原子事务。
- [candidate controller误写 canonical authority] → Task/Environment/Doctor mutation只使用Receipt解析的retained controller invocation，并增加负向测试。
- [Timeline把不完整时间误报为精确耗时] → 时间戳可空，只在可证明两端间计算duration，显式区分unknown和四类等待。
- [前置 failed-shard retry契约变化] → Timeline消费closed attempt/evidence projection，不依赖具体GitHub matrix布局；联合验收时再适配最终schema。
- [一键closeout扩大删除授权] → carrier与local selection cleanup仍要求当前调用显式授权；正式remote release ref删除保持独立且默认不执行。

## Migration Plan

1. 先增加timeline domain与纯函数测试，不改变现有release入口。
2. 增加orchestration runner及fixture integration tests，保留原transaction/Git convergence CLI兼容。
3. 更新`buildr-release`与release checklist，默认使用新编排入口，原owner脚本继续作为诊断/恢复底层。
4. 等两个前置Task交付后，用真实failed-shard retry与下一次release fixture完成联合验收，再收敛Change和正式验证。

## Open Questions

无当前实现阻塞。failed-shard retry最终closed projection的字段名由前置Task决定；本任务只要求稳定表达`runId + runAttempt + reused evidence + rerun scope + aggregate identity`。
