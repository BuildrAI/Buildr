## Context

前一 Contribution 已证明 Core 的范围放大问题已收窄，当前主要成本来自必须真实运行的黄金 owner。`system-task-finish` 当前 6 条 journey 反复执行 seed 初始化、bare remote 创建、push、retained clone 和 Git identity 配置；同口径基线为 77.44 秒，其中测试文件 76.54 秒。这些准备不承担 Finish primary evidence，但每条 journey 的 worktree、SQLite、Finish delivery、remote readback 和 cleanup 必须保持真实且隔离。

## Goals / Non-Goals

**Goals:**

- 消除 Finish journey 内不承担主证据的重复仓库准备。
- 保留完整初始化、Finish、cleanup、remote/readback 的真实路径。
- 形成 prepare/body/wait/cleanup 可复核实测，并据此校准预算。
- 完成三轮干净 Core、竞争 Core/affected 与完整 Candidate/Release 验收。

**Non-Goals:**

- 不创建第二套 Context Runtime 或 fixture cache。
- 不共享可写 Workspace、worktree、SQLite、profile 或进程状态。
- 不改变 Core/Candidate membership、Release authority 或全局并发。
- 不缓存被测结果，不 mock Finish/Git 算法。

## Decisions

1. **先对照、无稳定收益则不接入。** 实验让4条单仓case通过现有`GIT_REPOSITORY_CONTEXT_KEY`取得独立bare remote与attached checkout，scratch和复杂多仓路径保持原样。三轮基线中位75.79秒，三轮候选中位75.85秒，因此正式实现回退Context依赖与prepared helper，全部journey继续独立准备。
2. **保留完整真实路径。** 实验和回退后都没有替换陈旧run/rollover scratch自举或多仓partial-delivery topology；所有case继续执行真实worktree、commit、push、readback与cleanup。该结论证明当前重复初始化不是值得扩建的瓶颈。
3. **分段以测试 harness 事件记录。** 每条 journey 把仓库物化与 case 定制记为 prepare，把被测 Finish 操作记为 body，把显式资源/进程等待记为 wait，把 `t.after` 清理记为 cleanup。分段只观察，不改变断言或被测执行。
4. **以同 owner 同命令比较收益。** 先记录冻结 base 的基线，再对候选至少三次运行，报告中位数和波动；只有正确性覆盖闭合后才调整 registry target。预算是观察值，不把性能变成正确性失败。

## Risks / Trade-offs

- [复制 bare repository 可能比小仓 init 更慢] → 同 owner 多轮实测已证明无稳定收益，正式实现已回退并记录反例。
- [prepared baseline 隐藏初始化缺陷] → 保留 scratch case，provider 自身也有 init/clone 契约测试；Finish owner 仍执行真实 worktree、commit、push、readback 和 cleanup。
- [phase 计时受 node:test cleanup 时机影响] → 明确 cleanup 由 lease/runtime evidence与 owner wall-clock共同记录，不把未观测等待伪装为 body。
- [全量验收耗时长且受竞争影响] → 分离三轮干净 Core、竞争轮和 Candidate/Release，记录 queue/resource wait，不以竞争轮冒充干净基线。

## Migration Plan

测试 harness 与 registry 原位迁移，无数据迁移。若候选实测退化，可撤回 prepared fixture 接入与预算调整；公共产品行为和 Release lane 不受影响。

## Open Questions

- 无。当前正式结论为准备复用收益不足；`system-task-finish`诚实预算为80秒，Core/Candidate数学下限分别为249秒/339.5秒。
