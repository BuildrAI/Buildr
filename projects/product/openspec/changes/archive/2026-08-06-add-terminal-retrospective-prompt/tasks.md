## 1. 契约与当前认知

- [x] 1.1 更新 Task terminal prompt 与 Token 可见性相关的 capability contracts 和 current knowledge
- [x] 1.2 更新 `task-manager`、`task-finish`、`task-retrospective` 随包 Skills

## 2. 终态提示实现

- [x] 2.1 为 Task Record terminal operation result 增加共享的非阻塞任务复盘建议
- [x] 2.2 为 Task Finish complete result 增加同一建议，并保持 blocked 恢复动作优先
- [x] 2.3 在 CLI 人类可读终态输出中展示建议

## 3. 验证与投影

- [x] 3.1 补充 Task Record、Task Finish、CLI 与 Skill 契约测试
- [x] 3.2 同步 Codex runtime 投影并验证 doctor
- [x] 3.3 运行 affected verification 并完成 OpenSpec consistency 检查
