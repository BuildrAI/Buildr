# 保证验证资源公平排队

## 目标

让跨 Task 的 coordinated verification resource 按确定的先到顺序授予容量，避免新运行持续抢占导致老 waiter 饥饿或 600 秒超时。

## 边界

- 保留 capacity、lease、TTL、heartbeat、取消、timeout 与精确 owner cleanup。
- 只修改 Verification execution 的 transient resource coordination。
- 不改变 `verification.yml`、Task Verification Result、Task Development 或 Finish authority。
- 不建设通用 scheduler、优先级平台或跨主机服务。

## 验收

- 多个有效 waiter 同时竞争时，新 waiter 不能越过更早 waiter。
- 取消、超时、崩溃或过期 waiter 不会永久阻塞队列。
- 任一清理只能作用于 token/owner 匹配或已证明过期的 ticket/lease。
- 现有 Project declaration 与 portable Result schema 保持兼容。

## 来源事实

2026-08-04 的正式 Full 验证中，老 waiter 在 `task-lifecycle-heavy` 上等待期间被后续运行抢先取得 slot，最终在 600 秒后失败；共享队列清空后的同一目标在 149.0 秒内完整通过。
