## 1. Workspace Node Domain

- [x] 1.1 扩展 Workspace manifest schema、domain model 与 migration，支持精确 `runtime.node.version` 并保持未知字段 fail closed
- [x] 1.2 实现 Workspace Node identity、受管 runtime 路径、发行包完整性校验、原子准备与缺失恢复 service
- [x] 1.3 为 manifest、identity、platform/arch 映射、runtime probe 与并发/失败恢复补充 unit tests

## 2. Workspace Lifecycle 与入口

- [x] 2.1 让 `buildr init` 写入当前受支持 CLI 的精确版本并在成功前准备对应 runtime
- [x] 2.2 让 `buildr sync` 迁移缺失声明、按声明收敛 runtime，且不静默升级、降级或改写已有声明
- [x] 2.3 让 `buildr doctor` 只读报告声明、runtime、CLI/npm/验证环境一致性与 `sync` 修复建议
- [x] 2.4 更新 development/installed launcher，使普通 Workspace 命令固定使用受管 Node，仅允许 init/doctor/sync 使用兼容 bootstrap Node

## 3. Execution Identity

- [x] 3.1 将 Workspace Node identity、executable 与 probe evidence 纳入 task environment receipt/context 和 `executionReady` 门禁
- [x] 3.2 让 verification executor 用 Workspace Node environment 启动 node/npm/测试，并把 identity 纳入 `buildr.verification-run/v1` evidence digest
- [x] 3.3 让 Task Finish preflight/freeze/reuse/resume/deliver 核验 Node identity，漂移或旧 evidence 缺失 identity 时 fail closed

## 4. 产品资产与验收

- [x] 4.1 更新 Workspace package baseline、CLI/reference docs、current knowledge 技术架构、Buildr Service 说明与 Project glossary
- [x] 4.2 增加 PATH 前置 Node 18、runtime 删除后 doctor/sync 恢复、sync 不改版本、Candidate/Finish identity 漂移的 integration/contract tests
- [x] 4.3 运行 OpenSpec strict/proposal guard、受影响测试与 `buildr verification run --level affected`，修复所有发现
- [x] 4.4 运行最终完整 Candidate，记录 Node identity、timing 与 evidence lifecycle，并仅在成功后勾选本项
