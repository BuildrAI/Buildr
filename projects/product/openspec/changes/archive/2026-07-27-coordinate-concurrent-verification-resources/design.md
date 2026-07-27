## Context

当前 Product verification scheduler 使用进程内计数器限制 `concurrencyClass` 和 `resources`。它能防止同一个 Candidate run 内的冲突，但两个 task environment 分别执行 `npm test` 或 Candidate 时，各自拥有独立计数器。Project `verification.yml` 也只描述环境和副作用，没有表达某项资源究竟可独立、需命名隔离、需排队还是必须外部授权。

该能力必须保持 Buildr 边界：只协调已由验证政策选择的命令，不理解或调度 Agent 任务本身。

## Goals / Non-Goals

**Goals:**

- 让 Project 声明验证资源的稳定身份、处理策略、容量、命名变量、清理边界和授权。
- 让同一 Workspace 的多个验证进程共享有限容量资源。
- 为等待、取得、续租、释放和过期恢复提供任务归属证据。
- 保持未声明 Project 和现有验证能力向后兼容。

**Non-Goals:**

- 不建立通用任务队列、Agent scheduler 或跨机器集群调度服务。
- 不替 Project 创建数据库租户、云账号或外部业务数据。
- 不自动授权 `external` 资源，也不清理外部系统。
- 不用一个 Workspace 全局锁串行化全部验证。

## Decisions

### 1. Project 先登记资源，能力只引用稳定 id

`verification.yml` 根新增可选 `resources`，能力新增可选 `resourceClaims`。资源条目使用以下四种 `strategy`：

- `isolated`：每个 task/run 天然独立，无共享租约；清理由 task 或 provider 按声明负责。
- `namespaced`：执行器生成稳定 task/run namespace，并通过声明的环境变量交给命令。
- `coordinated`：多个进程按声明容量取得 slot 租约后执行。
- `external`：Buildr 只披露资源与授权缺口；没有显式授权不得执行，也不自动清理。

资源定义集中在 Project，而不是让每个 capability 重复容量和清理规则，可避免同名资源语义漂移。没有 `resources` 或 `resourceClaims` 时保持现有行为。

### 2. 容量租约放在 canonical Workspace 的共享 Git metadata

对 Git task worktree，协调根解析为 repository `git-common-dir/buildr/verification-resources`，因此同一 Workspace 的多个 task checkout 会看到同一组 slot；普通 checkout 可以由 provider 显式传入 canonical coordination root。租约不写入任一 delivery tree。

每个 slot 使用原子目录领取，并记录 resource、slot、run/task、PID、host、token、acquired/heartbeat/expires 时间。持有者周期续租；释放时必须再次匹配 token。过期租约通过原子 rename 后清理，多个竞争者不能同时接管同一 slot。

备选方案是 Workspace 全局文件锁；它会把无关资源全部串行化，也无法表达容量大于 1，因此不采用。常驻 daemon 会扩大安装、生命周期和故障面，本阶段也不需要。

### 3. 跨进程协调叠加在现有 DAG scheduler 上

现有进程内 global/class/resource 限制继续负责单次 run 调度。step 在真正启动 executor 前，再向共享 coordinator 领取其 `coordinated` claims；完成、失败或异常都在 `finally` 中精确释放。独立步骤不会因为其他资源被占用而统一停机。

Product 自举 verification registry 将现有 `workspace-saturating` 与 browser 资源登记为跨进程容量资源，以真实验证框架证明该机制。Project provider 以后消费同一资源模型，不需要为不同测试技术栈建立专用调度器。

### 4. 证据区分本地排队与跨任务等待

每个结果保留现有 DAG `queueDurationMs`，并新增 `resourceCoordination`：claim ids、slot、owner、跨进程等待时长、取得与释放状态。summary 记录 coordination root 的摘要而非暴露其他任务完整路径。验证 pass/fail 仍由测试结果决定；等待超时或租约协议损坏返回 `incomplete/failed`，不得绕过资源约束直接启动。

### 5. 清理按 ownership fail closed

run 只释放 token 与自身匹配的 slot。`isolated/namespaced` 仅清理声明为 provider-owned 且位于 task/run root 的内容；`task-owned` 交给 task environment cleanup；`external` 永不自动删除。进程崩溃依靠 lease expiry 恢复，但不得清理仍有有效 heartbeat 的其他 run。

## Risks / Trade-offs

- [验证进程崩溃留下 slot] → heartbeat + expiry + 原子 stale takeover，证据标记 recovered lease。
- [等待资源占用本进程的一个 DAG 调度位] → 当前实现保持简单和确定性；通过多资源细粒度 claim 减少影响，后续有真实性能证据再拆分 waiting/running 状态。
- [多个物理 Workspace 错误共享资源] → 默认 coordination root 绑定 Git common-dir；显式 root 必须由 task environment/provider 提供，不按 cwd 猜测。
- [外部共享系统被误认为可排队即安全] → `external` 始终要求显式授权，coordinator 不创建租户、不修改数据、不清理外部状态。

## Migration Plan

1. 以可选字段扩展 `verification.yml` validator 和文档，旧声明零迁移。
2. 新增通用本机资源 coordinator 与单元/跨进程集成测试。
3. 将 Product verification runner 接入 coordinator，并登记现有有限资源。
4. 更新 timing evidence、当前认知与任务看板；验证后归档 Change。

## Open Questions

无。
