## Context

Task Finish 当前把 Delivery Adaptation 的“Agent 已审查”投射为 carrier 相对 Delivery Baseline 的非空 Git commit。这个机械信号无法表达一种真实状态：原 Task Contribution 已经进入 target，后续提交又修改了重叠路径，Agent 审查确认最新 target 已满足原任务语义，因此正确适配是零文件差异。现有实现会拒绝 `head === baselineHead` 或 `tree === baselineTree`，而制造空提交或无关文件差异既不能提供新的语义证明，也会污染交付历史。

当前受阻 run 已保存 current handoff、Candidate、Content Target、原 Task Contribution 的 baseline/source tree、最新 Delivery Baseline、run-owned carrier 与 matching resume token。恢复应复用这些 authority，不迁移 SQLite、不建立第二份 review store，也不从标题或工作区当前 diff 猜测贡献。

## Goals / Non-Goals

**Goals:**

- 让 Agent 能显式确认 run-owned carrier 的正确适配为零 tree delta，并由同一 run 继续 verify、deliver、activation、Doctor 与 cleanup。
- 对既有 `adaptation-required` v2 run 生效，不要求重建 Candidate、Verification、Completion Review 或 Development handoff。
- 零差异路径不创建重复 carrier commit、不执行 fast-forward/push，并记录可解释的 `already-contained` evidence。
- 分离 carrier 实际 delta paths 与冻结 Task Contribution paths，保证 retained activation 和 self-bootstrap 仍覆盖原任务影响面。
- 保持 token、identity、baseline、source snapshot、carrier ownership/cleanliness、远端读回与 target drift 的 fail-closed 边界。

**Non-Goals:**

- 不自动判断业务语义等价，也不把零差异恢复描述为 Buildr 的确定性语义证明。
- 不放宽普通 `already-contained` 的 ancestor + changed-path after-state 精确证明。
- 不新增数据库、review writer、恢复 manifest、远端分支、force push 或发布动作。
- 不改变 non-Git carrier、PR、release、deploy 或多仓库交付模型。

## Decisions

### 1. 使用显式 resume 参数表达 Agent 的零差异审查结论

`task finish run` 增加 `--accept-zero-delta-adaptation` 布尔参数。它只在 current run 为 `adaptation-required`、matching resume token 已提供且 prepare 将核验同一 baseline carrier 时合法。参数只表达本次 Agent 审查结论；Application 只有在 prepare 成功采用后才把结果写入既有 Finish current carrier facts。

选择显式参数而不是“无修改重试即自动接受”，是为了避免脚本或重复调用把未完成的语义审查误判为接受。选择参数而不是新 command、marker 文件或独立 review store，是为了保持单一 `run|inspect` CLI 与 Finish current authority。

### 2. 零差异适配不创建提交

采用条件为：carrier 仍由同一 run 注册、working tree/index clean、`HEAD` 与 tree 都等于冻结 Delivery Baseline、Task Contribution source 与 current Development handoff 未漂移、target baseline 未前进。满足后仍使用 `agent-reviewed-delivery-adaptation` reuse mode，并记录 `zeroDelta: true` 与零 delta identity；不要求 baseline HEAD 的提交消息等于原冻结 delivery message，因为没有创建新的交付提交。

空提交被否决：它只为通过 message/tree 守卫制造重复历史，不增加内容或语义证据。无显式参数时保持现有 `delivery-adaptation-missing`。

### 3. 单独保存冻结贡献路径用于 activation

零差异 carrier 的 `changedPaths`/`changes` 继续如实表示 carrier 相对 Delivery Baseline 的实际 delta，因此为空。Application 从已冻结 Task Contribution 的 original baseline tree 与 source tree 以 `--no-renames` raw diff 重新得到规范化路径，并以 additive `activationPaths` 保存到 carrier。

通用 retained activation 和 Buildr self-bootstrap runner 使用 `activationPaths`，旧 Result 没有该字段时回退到 `changedPaths`。这样既不篡改 carrier delta 语义，也不会因零差异适配漏掉 runtime render、development CLI、Buildr Web Launcher 或 package sync。

### 4. Deliver 把稳定零差异 baseline 记录为受控 already-contained

当 verify 已采用零差异适配，且 deliver 观察到远端仍等于冻结 Delivery Baseline/carrier HEAD 时，delivery 直接记录 `targetDisposition: already-contained`，保留 Agent review、zero delta、baseline/carrier/ref identity evidence，跳过 fast-forward 和 push，再继续 activation、Doctor、remote readback 与 cleanup。

若远端在 prepare 后再次前进，零差异审查不自动跨越新 baseline；run 返回新的 `task-finish.target-race` 和 exact token。普通 deterministic `already-contained` 继续要求原有逐路径 after-state 证明。

### 5. 既有 blocked run 原地兼容

既有 v2 `adaptation-required` run 已包含 adoption 所需的 Task Contribution trees、Delivery Baseline、carrier root 与 current token。新实现只读取这些已保存事实并增加 additive carrier evidence，不迁移或回填历史 row。当前 run 可在候选修复交付并激活后，使用其最新 token 与显式参数恢复。

## Risks / Trade-offs

- [Agent 误用显式参数] → 仅在 matching adaptation-required run 接受，并继续核验 source/handoff、baseline、carrier ownership/cleanliness；Result 明确标记 agent-reviewed 而非 Buildr 证明。
- [零差异路径漏掉自举动作] → 从冻结 Task Contribution trees 派生 `activationPaths`，通用 activation 与 self-bootstrap 共用该字段，并增加路径分类回归测试。
- [prepare 后 target 再次前进] → 不跨 baseline 复用审查，返回 target-race 和新 token。
- [旧客户端看见 additive evidence] → 保持 `buildr.task-finish-result/v2` 与既有字段语义；旧 consumer 忽略新字段，runner 对旧 Result 回退 `changedPaths`。
- [实现只让当前 fixture 通过] → 增加真实 Git/remote、CLI 参数合法性、existing blocked run、无 flag、baseline drift 与 activation paths 的正反场景。

## Migration Plan

1. 在 Task worktree 实现参数门禁、零差异 adoption/verify/deliver 与 activation path 分离。
2. 更新 Task Finish Skill、package target、CLI help、current knowledge 和正式验证 fixtures。
3. 完成 OpenSpec convergence、Task Verification、Completion Review 与本修复 Task Finish。
4. 由 Buildr 自举 runner 激活最新 retained checkout。
5. 使用原 Buildr Web run 的 current token 与显式参数恢复同一 run；成功后由该 run 的自举计划完成 CLI/Launcher、最终 Doctor 与 cleanup。

回滚时不使用新参数即可保持旧 fail-closed 行为；已成功完成的 Finish terminal Result 不回滚或改写。

## Open Questions

无。
