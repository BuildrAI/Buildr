## Context

coordinated resource 目前用共享目录中的固定 capacity slots、owner token、TTL 和 heartbeat 控制并发。等待者每 50ms 直接尝试创建 slot，没有持久等待顺序；slot 释放后，任一新旧进程都可能先成功。本次多个正式验证并发时，老 waiter 被后来运行多次越过并在 600 秒后失败。

## Goals / Non-Goals

**Goals:**

- 同一 resource 的有效 waiter 按确定顺序取得空闲 slot，消除饥饿。
- 保留精确 owner/token release、TTL recovery、取消与 timeout。
- waiter 崩溃、取消或过期后，后续运行可以有界恢复。

**Non-Goals:**

- 不建设通用 scheduler、优先级系统或跨主机服务。
- 不改变 Project declaration、Task Verification Result 或 Task lifecycle authority。
- 不承诺完整验证 wall-clock，只保证资源取得顺序与有界恢复。

## Decisions

1. 在现有 resource root 内增加最小 ticket 目录，ticket 保存 resource、owner、创建顺序、heartbeat/expiry 与随机 token。取得 slot 前，waiter 必须确认自己位于当前可用容量范围内的最早有效 ticket；只有这些 waiter 可以竞争实际 slot。
2. ticket 先在临时目录完整写入，再通过 rename 原子登记。顺序使用同机单调时钟值，并以随机 token 对同一时钟值的并发登记形成稳定次序；实现不得依赖 Task 名称、PID 大小或目录遍历原始顺序。
3. ticket 与 lease 分离：ticket 只拥有等待资格，lease 继续拥有执行容量。成功取得 lease 后原子撤销自己的 ticket；取消、timeout 与异常路径只清理匹配 token 的 ticket。
4. stale recovery 复用 TTL/heartbeat 边界。清理者只能移走已过期且 ownership 可验证的 ticket，不得删除活跃 waiter 或其他 lease。
5. 公平等待事实只进入 transient execution evidence；不进入 portable Result 或 Project schema。

备选方案是仅增大 600 秒 timeout，但它不能消除饥饿，只会延迟失败；为每个 Task 建私有 coordination root 会绕过真实容量保护，因此均不采用。

## Risks / Trade-offs

- [等待者在 ticket 到 lease 之间崩溃] → ticket TTL 与 heartbeat 允许后续 waiter 有界恢复。
- [时钟偏移影响顺序] → 单机共享 root 是当前边界；使用不受墙钟回拨影响的单调时钟，同一时钟值用稳定 token 排序。
- [清理竞争误删 owner 状态] → 所有 rename/remove 前复核 token，沿用现有精确 ownership 模式。
- [公平性降低短任务抢占机会] → 这是有意取舍；capacity 仍允许多个最早 waiter 并发。
