## 1. 基线与执行路径

- [x] 1.1 记录 `system-task-finish` 同口径基线及现有 Git/Workspace/SQLite/cleanup 操作分布
- [x] 1.2 对照现有 Git Prepared Fixture 并在多轮无收益后回退，保留全部独立真实路径
- [x] 1.3 输出 journey prepare/body/wait/cleanup 以及实验期 Context prepare/materialize evidence

## 2. 正确性与收益验证

- [x] 2.1 运行 fixture/Context 契约、`system-task-finish` 定点测试和污染反例
- [x] 2.2 多轮复测优化 owner，记录中位数、波动和不适合复用的路径
- [x] 2.3 更新 owner target、证据审计、总工作量、关键路径和资源容量数学下限

## 3. 正式验收

- [x] 3.1 运行严格OpenSpec、定点owner与affected实现反馈
- [x] 3.2 冻结证据文档、知识影响与诚实预算并收敛OpenSpec Change
