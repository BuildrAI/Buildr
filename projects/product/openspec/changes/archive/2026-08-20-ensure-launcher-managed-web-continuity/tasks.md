## 1. Launcher ownership 与交接基础

- [x] 1.1 在实例管理层定义当前 binding 精确复用、同 installation CLI 接管、同 slot 旧 binding 替换和 foreign 冲突判定
- [x] 1.2 实现带实例 secret 的优雅停止与有界退出等待，保持 receipt 和进程现场可诊断
- [x] 1.3 让锁竞争方只等待当前 binding 的健康实例，避免并发点击把旧 CLI 实例误报为托管成功

## 2. Web Runtime 生命周期

- [x] 2.1 在 `startLocalWorkspaceApp` 中编排锁内重验、handoff、binding 端口启动和最终健康身份确认
- [x] 2.2 收敛 `SIGINT`、`SIGTERM`、非 Windows `SIGHUP` 与 server close 的 listener/receipt 清理
- [x] 2.3 为 ownership 冲突、停止超时和并发等待失败提供稳定、可操作且不泄露 secret 的诊断

## 3. 回归验证与当前认知

- [x] 3.1 增加普通 CLI 实例到当前 npm Launcher binding 的成功交接测试，证明 PID/identity 变化与旧终端退出后的连续性
- [x] 3.2 增加精确 binding 复用、同 slot 旧 binding、foreign ownership、handoff 超时和并发 Launcher 测试
- [x] 3.3 增加 `SIGHUP` 清理测试，并保持 released/development profile 隔离与既有 Launcher 测试通过
- [x] 3.4 同步受影响的 Buildr Service 当前认知、Brief 和术语检查，运行 focused/affected 反馈并收敛 OpenSpec archive readiness
