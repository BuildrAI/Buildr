## Context

`buildr-self-bootstrap-sync` 在 frozen Task Contribution 命中 Local App 路径时调用 development-only Launcher manager。manager 会认证当前 development 实例并在原子切换 Launcher 前发送 `SIGTERM`，但 runner 随后只验证 development entry 并执行 Doctor/Finish resume；Doctor readiness 不要求默认 HTTP 实例仍存活，因此 activation 可以成功而用户的 Buildr Web Dev 已停止。

该 runner 是自举 Workspace 的单一 activation orchestrator，必须保持为可投射、不能依赖 Product 内部 Application import，也不能把默认实例登记成 Task-owned resource。

## Goals / Non-Goals

**Goals:**

- 保持安装前健康、属于 development channel 的默认实例在同一端口连续可用。
- 恢复后的实例必须绑定 retained successor checkout、Environment retained Node 与新 Launcher identity。
- 把认证、安装、恢复和恢复后验证纳入同一个 `install-local-app` 阶段 evidence，并在任何不一致时 fail closed。
- 对恢复失败启动的子进程做有界回收，避免留下未知实例。

**Non-Goals:**

- 不在安装前没有健康 development 实例时自动启动服务。
- 不改变 npm-owned `Buildr Web`、Task preview、公开 Launcher CLI 或 Task Environment cleanup。
- 不引入 daemon manager、新 SQLite/Receipt 字段或第二个 activation lifecycle。
- 不尝试用旧 Launcher identity 回滚到旧交付版本。

## Decisions

1. **由 self-bootstrap runner 决定是否恢复，而不是让 Launcher manager 无条件重启。** Runner 在安装前调用 bundled continuity helper，对默认 `instance.json` 发带 secret 的 health 请求，并只接受 `launcherIdentity.channel=development` 的健康实例。这样人工 `npm run install:development` 仍保持现有安装语义，activation 才拥有 frozen result、retained bridge 与 successor identity 所需的完整上下文。替代方案是把重启放进 manager，但 manager 无法证明 Finish successor 与 retained Project bridge。

2. **恢复条件冻结为安装前观测。** helper 只返回 `healthy-development`、`not-running`、`stale` 或 `different-owner`；只有第一种状态携带经过校验的 loopback URL、端口、PID 和 Launcher identity，runner 才在安装后恢复。安装后的 state 变化不能反向把不适用实例升级为自动启动。

3. **通过 retained Project bridge 启动，显式注入新 Launcher identity。** bundled helper detached spawn `projects/product/buildr web --port <same> --no-open`，环境显式包含 `BUILDR_NODE=<retained Node>` 与新 Launcher identity path。它等待默认 instance health，并验证端口、development channel、source root、successor HEAD 与 Node；不执行 PATH `buildr` 或 npm-owned Launcher。

4. **连续性 evidence 留在既有阶段结果。** `install-local-app` 的 operations/effects记录安装前状态、同端口恢复结果和新 PID/identity，不创建持久状态。`verify-development-entry` 与 finalize 仍保持原顺序；恢复失败时这两个后续阶段均不执行。

5. **失败回收而不回退交付。** Launcher manager 自己继续负责原子切换失败时恢复 `.previous`。若 Launcher 已成功更新但 HTTP 恢复失败，helper 只终止本次启动且能证明 ownership 的子进程，runner 保留新 Launcher 并返回 blocked，供同一 activation 按报告事实重试。回滚到旧 Launcher 会让入口 identity 与 delivered retained checkout 分叉，因此不采用。

## Risks / Trade-offs

- **[实例文件在观测与安装之间变化]** → manager 仍执行自己的 ownership/health 检查；runner 仅依据冻结的安装前健康证据决定恢复，并对恢复后的 port/identity 重新验证。
- **[detached 子进程启动后不健康]** → helper 使用有界等待并只回收自己刚启动、PID 可证明的进程；runner fail closed，不继续 Doctor/resume。
- **[Windows 与 macOS Launcher identity path 不同]** → runner 从 manager 的 closed result 与 platform 计算/验证 identity path，helper 不扫描 Applications 或 PATH。
- **[服务短暂中断不可完全消除]** → 当前单实例和固定端口要求先停止旧进程；本变更保证自动同端口恢复，不承诺零毫秒连接中断。

## Migration Plan

无需数据迁移。发布时先严格验证 Change，再运行 runner integration/system tests。若安装本身失败，沿用 manager 的原子 Launcher rollback；若恢复失败，保留新 Launcher、回收本次异常子进程并阻塞 activation，修复原因后由原 owner 重试同一正式入口。

## Open Questions

无。
