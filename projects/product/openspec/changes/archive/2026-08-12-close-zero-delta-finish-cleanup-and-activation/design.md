## Context

零差异 Delivery Adaptation 使用专用 containment proof，因为 carrier 的实际 `changedPaths` 与 `changes` 必须为空；通用 `inspectGitCarrierContainment` 则明确要求至少一个 changed path。deliver 已生成专用 proof，但 retained cleanup 无条件调用通用观察器并做整值比较，因而同一份合法 proof 在 cleanup 边界必然无法重建。

Buildr 自举 runner 的当前恢复模型把 Finish `finalRemoteRef` 同时当成冻结输入和唯一执行基线：只接受该 ref，或本 run 带精确 trailer 的单一 successor。多个 Formal Finish 可以先后完成而各自等待 post-Finish activation；后一个合法 `Buildr-Task` commit 或另一个 runner 的合法 successor 会推进 retained `dev`，使较早 Result 永久失败。runner 又不能建立持久队列或回写 Finish，所以必须从当前 Git/remote 与现有 commit provenance 重算安全执行基线。

## Goals / Non-Goals

**Goals:**

- 让 deliver 与 retained cleanup 复用同一个 zero-delta containment 观察器，并在 cleanup 前重新核验真实 carrier/target facts。
- 允许 self-bootstrap runner 在 frozen ref 的可证明 Buildr-owned、无 merge、clean、remote-aligned 后继链上选择当前 HEAD 作为 activation base。
- 保持本 run successor 的精确幂等恢复、普通 push、无状态重算和 fail-closed 边界。
- 用真实子进程和多 run 顺序场景证明旧错误会被捕获。

**Non-Goals:**

- 不改变 Agent 对零差异语义等价的显式确认责任，不让 Buildr 声称已证明语义等价。
- 不重跑 Formal Verification，不重建 Candidate/Development handoff，不修改 Task Contribution 或 Environment authority。
- 不增加 activation queue、receipt、SQLite schema、后台进程、远端服务或普通 Workspace 能力。
- 不允许任意 descendant、merge、dirty tree、local-only unknown commit、remote drift、伪造的当前 run successor 或共享历史改写。

## Decisions

### 1. 共享专用 zero-delta containment 观察器

在 `git-task-contribution.mjs` 增加导出的专用观察器。它不把空 changed-path 当作通用 containment，而是同时要求：

- carrier 为 `agent-reviewed-delivery-adaptation` 且 `zeroDelta=true`；
- carrier HEAD/tree 精确等于 Delivery Baseline HEAD/tree；
- `changedPaths`、`changes` 为空，carrier delta identity 与真实零 delta 一致；
- run-owned carrier 仍注册、clean 且通过现有 carrier equivalence 检查；
- target ref 可解析并精确等于 carrier/baseline HEAD；
- 输出的 code、proof、refs、空 paths 与 identity 由同一函数确定性构造。

deliver 和 cleanup 都调用该观察器，并继续对已保存 proof 做整值比较。普通非零 `already-contained` 仍使用现有 changed-path mode/blob 观察器。这样不扩展通用观察器的输入语义，也不信任 SQLite 中的 proof 自证。

备选方案是让 cleanup 只识别 proof code，或复制 digest 算法。前者会绕过 carrier/target 重验，后者会再次产生两个实现，因此拒绝。

### 2. frozen ref 与 activation base 分离

`plan.baseRef` 继续绑定同一 Finish Result 的 final ref，并保持 plan identity 不变；runner 在每次 preflight 动态选择 `activationBaseRef`：

- HEAD 等于 frozen ref：fresh，activation base 即 frozen ref；
- HEAD 是本 run/plan 的精确 successor：其 parent 是 activation base，remote 只可等于 parent 或 HEAD，以恢复未 push 或已 push 状态；
- HEAD 是 frozen ref 的严格后继且 remote 精确等于 HEAD：只有 frozen ref 到 HEAD 的 first-parent 链无 merge，且每个 commit 都带 `Buildr-Task` trailer，或同时带 `Buildr-Finish-Run` 与 `Buildr-Closeout-Plan` trailer，才作为 fresh-descendant，activation base 为 HEAD；
- 其他情况全部 blocked。

识别的 provenance 只证明该 commit 属于 Buildr Formal Finish 或 self-bootstrap 交付载体，不证明业务语义；业务语义已经由各自冻结的 Candidate/Finish 拥有。runner 仍只按当前 Result 的 frozen paths 执行动作。

备选方案是接受任意 clean remote descendant。它会把普通人工 commit 也纳入恢复范围，边界过宽。另一方案是建立持久 activation queue，会增加第二套 workflow authority，亦拒绝。

### 3. successor 相对 activation base 创建与恢复

需要 sync delta 时，新 successor 必须直接以 `activationBaseRef` 为 parent，并继续写入当前 run/plan trailers；push 前 remote 必须仍等于 activation base。重跑时若 HEAD 已是该精确 successor，则只允许 remote 位于 parent 或 HEAD，并要求 sync 重算为零 delta。不同 Result 可以随后把前一个 runner successor 当作合法 Buildr-owned descendant，再独立执行自己的去重动作。

该设计不会把多个 Finish Result 合并为一个 plan，也不承诺跨 runner 原子性；每次调用仍返回自己的阶段、effects 和失败现场。

### 4. 测试 owner

- Integration：专用 proof 正常/篡改、retained cleanup 真实子进程、self-bootstrap descendant/provenance/顺序恢复。
- System：零差异 journey 不再 mock 掉最终 cleanup consumer，至少有一条场景穿过真实 retained cleanup 入口并证明 Environment/carrier owner 清理。
- Contract/static：Skill、canonical spec 与 runner marker/阶段边界一致。

## Risks / Trade-offs

- [仅凭 commit trailer 识别 Buildr-owned provenance 可能被人工仿造] → 同时要求 frozen ancestry、无 merge、clean tree、remote 精确对齐；当前 run successor 仍要求精确 run/plan identity。trailer 只是同一受控 Git 历史中的 provenance，不升级为业务 authority。
- [较早 runner 在较新代码上执行会得到不同 sync 输出] → runner 总是在当前 retained checkout 重算 sync，并把新 delta 绑定动态 activation base；不复用旧输出或旧成功布尔值。
- [多个 runner 依次执行可能重复安装] → 每个 Result 内继续去重，跨 Result 的 installer/sync 必须幂等；每次仍验证默认 CLI identity 与最终 Doctor。
- [专用 proof 校验过严导致旧兼容 Result blocked] → 只对明确 `agent-reviewed-zero-delta` proof 走新观察器；普通旧 Result 保持原路径。现有 v2 run 已具备所需 carrier/baseline/delta facts，无数据迁移。

## Migration Plan

代码交付后，先恢复当前 `cleanup_pending` 的旧 run，验证 Task/Environment/carrier 进入终态；随后由单一 self-bootstrap runner 按可证明 descendant 顺序消费仍待激活的 Result。无需 SQLite、Git 历史或 Result 迁移。若激活失败，保留当前 clean/commit/remote 事实并按同一 Result 重跑；不 reset、rebase、amend 或 force push。

## Open Questions

无。长期边界已由当前 Task intent 与既有 Task Finish/self-bootstrap authority 决定。
