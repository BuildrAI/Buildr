# 优化黄金生命周期执行路径

## 一句话摘要

用分段实测验证 Finish 黄金 journey 的重复初始化是否值得复用；实验无稳定收益后保持独立真实路径，只保留可观察性并校准 Core 与 Candidate 的诚实预算。

## 边界

不创建第二套 Test Context Runtime，不缓存被测结果，不共享可写 Workspace、worktree、SQLite、用户 profile 或跨 case 进程，不扩大并发，不改变 Candidate、tarball、Launcher 或 Release authority。

## 实施与验收

- `system-task-finish` 的 scratch case 保留完整 init→remote→clone→worktree→Finish→readback→cleanup。
- 非主证据准备曾用现有 `GIT_REPOSITORY_CONTEXT_KEY`做独立物化对照；多轮中位数无收益后已回退。
- 对优化前后记录 prepare/body/wait/cleanup、owner wall-clock、中位数与波动。
- 完成三轮干净 Core、一次 Core/affected 竞争和一次完整 Candidate/Release。

## 技术 artifacts

- `proposal.md`
- `design.md`
- `specs/product-verification-quality/spec.md`
- `tasks.md`
