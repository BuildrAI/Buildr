## Context

四个前置批次已经分别验证单项能力，但当前 Candidate 没有一个测试同时持有两个任务环境并贯穿完整组合边界。整体验收需要创建真实 Git worktree 和 Local App 进程，也需要验证跨进程资源租约与目标分支竞态，因此不能由若干互不关联的单元断言代替。

## Goals / Non-Goals

**Goals:**

- 在单个临时夹具中创建两个真实任务 checkout，并核对各自绝对 CLI invocation。
- 同时启动两个随机端口 Local App 预览，证明状态、端口和停止动作互不影响。
- 同时运行两个声明共享容量的验证任务，证明排队、归属和释放证据。
- 在本地目标分支制造可恢复竞态，证明一个任务不会覆盖另一个任务的目标 ref。
- 完成后只清理两个任务拥有的进程、租约、worktree 和分支，并证明 retained checkout 健康。

**Non-Goals:**

- 不启动两个真实 Agent session，也不把 Agent 推理纳入产品测试。
- 不访问 GitHub、npm、Docker、业务数据库或其他外部系统。
- 不替代各能力已有的细粒度测试。

## Decisions

1. **使用一个专用 Node 验收脚本编排整个场景。** 单一进程负责夹具身份、超时和最终清理，能够生成一份组合证据。备选方案是扩充多个既有测试，但无法证明它们属于同一并发场景。
2. **使用临时复制的最小 Buildr Workspace 与本地 bare Git remote。** 两个任务通过公开 CLI 创建，预览通过公开 CLI 管理；这样覆盖真实入口，同时避免修改开发者 retained Workspace。
3. **复用真实验证资源协调器和 Task Finish 状态机。** 验收不重新实现锁或竞态逻辑，只提供两个独立 run 的输入并断言其证据。
4. **把步骤登记为 Candidate required，不加入日常 changed 默认集合。** 该场景成本高且跨多个边界，适合最终候选；实现文件本身仍由 changed 路由到对应轻量测试。
5. **所有资源都带唯一 run id，并在 `finally` 中按所有权清理。** 清理后再次检查预览列表、租约目录、worktree 列表和 retained doctor。

## Risks / Trade-offs

- [真实进程和随机端口可能增加波动] → 使用公开 readiness、结构化 JSON、明确超时，不用固定 sleep 判断成功。
- [组合验收耗时增加 Candidate 时间] → 保持最小 Workspace，只运行两个短验证探针，并给步骤独立预算。
- [中途失败遗留临时资源] → 记录精确拥有者并在 `finally` 尝试停止、移除；失败时保留夹具路径供诊断。
- [本地 Git 竞态与真实远端仍有差异] → 只验证 Buildr 自有 ref observation 和 fail-closed 契约；网络与托管平台行为继续由现有发布测试覆盖。
