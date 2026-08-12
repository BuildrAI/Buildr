## Context

上一轮 Change 已把 OpenSpec convergence 变成产品持有的多阶段动作，但真实收尾暴露了三个相互放大的瓶颈。第一，新 capability 的 deterministic result 在 canonical 写入后才由正式 assurance 发现缺少固定章节或 Purpose 不满足 strict 约束；第二，每次实现修订都会改变 checkout-local CLI 与 candidate identity，Agent 必须依次恢复 context、current knowledge、convergence、candidate、target、runtime 和 formal assurance；第三，affected run 中 `openspec-contract-fixtures` 每次从头构建大量等价 Workspace/Project fixture，最终耗时 90.174 秒。

当前 Task Finish 只把 execution plan observations 纳入 completion metrics，手工 CLI、恢复编排和 bounded diagnostic file 没有统一 ledger，因此 receipt 显示的 3 次 round trip/3729 bytes 与真实过程不符。设计必须在不降低 assurance、隔离和 identity 约束的前提下减少实际工作，而不是只压缩输出或隐藏失败。

## Goals / Non-Goals

**Goals:**

- 在任何 canonical commit 前证明 deterministic sync 的完整 expected Project 可通过声明的 OpenSpec strict validation。
- 让一次 typed identity transition 原子完成失效计算、证据复用判断和可安全步骤恢复，把多次 claim/submit 降为单一产品调用。
- 把 OpenSpec contract fixtures 的稳定准备工作从每个 scenario 中提取并按 candidate/source identity 复用，正常 affected run 控制在 20 秒预算内。
- 让 compact diagnostic 足以定位失败 stage，并让 completion receipt 明确报告计量 coverage、真实产品执行耗时与 orchestration gap。
- 用真实 finish benchmark 验证正常路径、修订恢复、失败恢复和 runtime projection closeout。

**Non-Goals:**

- 不自动解决 OpenSpec 语义冲突或自动刷新 baseline。
- 不跨不相关 candidate、Workspace 或并发 finish run 复用可变 fixture。
- 不取消 affected/Candidate gate，不因预算超限把失败降级为成功。
- 不试图由 Buildr 统计 Agent 内部 token；只统计 Buildr 可观察的命令、bounded output 与 checkpoint 间隔。
- 不把 `status`/cwd/shell 变量等一次性 Agent 失误逐个做兼容别名；产品只提供能消除同类编排的稳定入口与诊断。

## Decisions

### 1. Expected-tree strict validation 是 apply 的提交前阶段

Planner 继续只判断 operation 是否有唯一结构结果，不复制上游 OpenSpec 的全部 schema 规则。Apply 先把所有 expected canonical files 写入 task-owned temporary Project copy，使用 receipt 绑定的 OpenSpec executable 执行 strict validation；只有全部通过才原子替换真实 canonical。validation receipt 绑定 expected file digests、executable/version 和 stdout/stderr diagnostic reference。

这优于在 planner 中硬编码 `Purpose >= 50` 等上游细节：上游规则升级时仍由真实 validator 决定。对明显缺少 proposal Purpose authority 的输入，planner 仍可提前 blocked；最终合法性由 expected-tree validation 统一保证。

### 2. 新增 typed recovery manifest，而不是放宽单步 completion

Task Finish application 增加 `recover` 动作，输入一个版本化 transition manifest：旧/新 environment binding、candidate tree、target ref、runtime projection、change/delta identity、transition effects 与可用 execution plans。状态机在单次原子写入中：

1. 验证来源 evidence 和 transition class；
2. 计算每个 step 的 effective fingerprint；
3. 终结被失效的 running attempt/lease；
4. 保留 identity 未变的 passed evidence；
5. 将真正变化的最早边界及下游标记 pending/stale；
6. 由同一 safe executor 连续推进已登记步骤，停在 formal assurance、语义 fallback或授权边界。

`implementation-changed` 默认使正式 assurance 及真实依赖失效；`archive-sensitive-metadata` 只按 provider policy复用；`runtime-projection-only` 必须由 source/projection digest 与允许路径集合证明，不能只接受调用方字符串声明。单步 `advance|resume` 保持兼容，recover 不建立第二套 run。

### 3. Fixture preparation 只在 verification run 内内容寻址复用

`openspec-contract-fixtures` 拆成 preparation 与 assertion：preparation 创建一个只读基础 Workspace/Product、安装或解析一次 bundled OpenSpec 1.6 identity，并生成 content-addressed template；每个会写入的 scenario 从 template 创建 task-owned copy-on-write fixture。完全只读的 assertions 可以共享 template，不同 mutation scenarios 不能共享工作目录。

cache key 包含 verifier source digest、OpenSpec executable/version、fixture seed、Node major、platform 和 candidate relevant inputs。默认生命周期绑定单次 verification run；只有后续证明跨 run cache 具备原子、清理与污染检测时才扩展。失败 scenario 仍保留独立 diagnostics/fixture reference，成功 fixture 按 provider policy清理。

### 4. Scheduler 对等价 preparation 建立显式 artifact dependency

Verification registry 增加 `produces/consumes` 的 run-local prepared artifact，scheduler 只启动一次 producer，所有 contract assertions消费同一 identity。不能从“命令名相同”推断复用，也不能把 preparation passed 当 assertions passed。timing 分别报告 prepare、assertions、queue、reuse saved estimate 和 wall-clock。

### 5. 诊断与计量使用 append-only observation ledger

每个 Buildr-owned command wrapper、safe handler、recovery action和 verification stage向 run-local ledger追加 bounded observation：command identity、cwd identity、start/finish、exit、stdout/stderr bytes、preview/digest/full reference、step/attempt。Compact failure从最后失败 observation提取 `stage`、结构化 child JSON 的 `code/status/findings/nextActions` 与 durable diagnostic引用，而不是只保留异常 message。

Completion receipt汇总 ledger 并返回 `coverage`：`product-complete`、`product-partial` 或 `external-unobserved`。`toolRoundTripCount`只统计 ledger 中的 Buildr-owned invocation；Agent/tool调用不可见时单列 `unobservedIntervals`，不得把部分计数叫作总 round trips。输出量使用原始 byte count，不用 preview长度代替。

### 6. 性能预算是可见质量信号，不改变通过语义

`openspec-contract-fixtures` 目标预算为 20 秒，整个 affected normal path 的目标仍约 100 秒，完整 Task Finish 正常路径目标约 3 分钟。超预算产生结构化 warning和benchmark regression，但验证内容失败仍按原 gate 阻塞；性能测试以稳定 work class、重复样本和 source identity比较，避免把单次机器抖动写成契约失败。

## Risks / Trade-offs

- [Risk] temporary Project strict validation仍可能复制较多文件 → 只复制 OpenSpec validator 必需的 planning surface，并以显式 inventory 测试防止漏文件。
- [Risk] copy-on-write在不同文件系统退化为完整复制 → provider报告实际 strategy和prepare耗时；预算基于 wall-clock而非假定机制。
- [Risk] typed recovery错误分类会复用无效 assurance → transition class由允许路径、content digest和provider policy共同证明，未知变化一律按 implementation-changed。
- [Risk] ledger增加磁盘与序列化成本 → preview有界、full output按run-owned文件保存、cleanup遵循现有verification evidence生命周期。
- [Risk] run-local cache降低单次耗时但无法覆盖跨run重复 → 先保证隔离和确定性；跨run缓存留作后续独立 Change。

## Migration Plan

1. 先增加 expected-tree validation与新 capability fixture，修复正确性门禁。
2. 拆分 OpenSpec fixture preparation/assertions并加入 run-local artifact identity与timing。
3. 实现 recovery manifest和状态机原子失效/复用，再接入 safe executor。
4. 增加 observation ledger、compact diagnostic和completion coverage字段，旧 receipt读取保持兼容。
5. 用本 Change 的真实 finish benchmark验证；若 recover异常，可回退到兼容的逐步 `resume|advance`，不迁移或删除已有 run。

## Open Questions

无阻塞问题。跨 verification run 的持久 cache 和 Agent host token 计量明确不在本 Change 范围。
