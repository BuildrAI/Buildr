## 1. 隔离 Launcher 验证副作用

- [x] 1.1 为正式 macOS Launcher 增加仅由验证 harness 注入的 no-notify 传播与日志保持逻辑，并补充 wrapper contract 测试
- [x] 1.2 将默认 release smoke 改为隔离数据根上的无界面 Launcher 启动，确保 no-open、no-notify 和 owned process cleanup
- [x] 1.3 增加显式 Platform Launcher Integration 入口，限制真实 macOS `open` / Windows shortcut 调用只存在于该入口且不打开浏览器
- [x] 1.4 更新 verification registry、CLI architecture 与 focused contract，证明 affected/full/Candidate 默认路径不调用平台 GUI

## 2. 固定 Buildr Web Dev 入口

- [x] 2.1 为 Development Launcher 定义固定默认端口 `4458`，让 macOS 与 Windows 启动脚本一致使用且不随机回退
- [x] 2.2 保留显式 no-open 测试控制和普通用户 Launcher 打开浏览器的既有行为，并覆盖两平台生成内容
- [x] 2.3 增加端口占用、同 profile 复用和 Preview/普通CLI随机端口不回归测试

## 3. 恢复 self-bootstrap 运行连续性

- [x] 3.1 修正 continuity helper 的 Development Web Data Root，确保不读取released实例
- [x] 3.2 将健康Development实例从原端口认证迁移到`4458`，记录previous/current端口、PID和retained successor identity
- [x] 3.3 覆盖未运行不自动启动、legacy随机端口迁移、foreign/occupied端口保留与Activation Attention结果

## 4. 当前认知与术语

- [x] 4.1 更新Change Brief与knowledge impact evidence，记录测试隔离、固定端口和运行意图恢复边界
- [x] 4.2 更新Buildr Service current knowledge，并对齐平台启动入口集成（Platform Launcher Integration）、浏览器使用测试（Browser Use Test）和无界面模式（Headless Mode）术语

## 5. 实现期验证

- [x] 5.1 运行Launcher、Buildr Web Runtime、release smoke与self-bootstrap focused tests并修复回归
- [x] 5.2 运行changed-test plan和适用affected验证，确认测试结束后无owned进程、默认浏览器或真实Development Web副作用
- [x] 5.3 严格验证OpenSpec Change并完成convergence readiness检查
