## 1. Runner 恢复语义

- [x] 1.1 在 foreign-clear 唯一重试中识别精确 target-race Result，并使用 matching token 承接一次现有 Task Finish recovery
- [x] 1.2 对 complete、Delivery Adaptation required 与其他结果做有界分流，保留 Agent 适配和用户授权出口

## 2. 工作流资产与测试

- [x] 2.1 更新 `buildr-self-bootstrap-sync` Skill 和自举 Component contribution，说明窄例外、停止条件与 owner 边界
- [x] 2.2 增加 integration tests，覆盖机械完成、进入 Agent 适配、普通调用不重试和再次 target-race 停止

## 3. 当前认知与收敛

- [x] 3.1 更新 Buildr 技术架构、Service 与 OpenSpec 生命周期知识，保持既有术语一致
- [x] 3.2 运行 focused tests、OpenSpec strict/preflight 和受影响产品验证，修复发现的问题
- [x] 3.3 对照最终实现收敛 Brief、knowledge impact 与 Change artifacts，确认 archive readiness
