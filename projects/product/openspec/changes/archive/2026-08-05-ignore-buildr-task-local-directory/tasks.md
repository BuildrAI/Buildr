## 1. Package 与 Workspace 收敛

- [x] 1.1 将 package workspace `.gitignore` 模板改为 `/.buildr/tasks/`
- [x] 1.2 让 `buildr init` 与 `buildr sync` 幂等追加 broad Task ignore entry，并保留已有规则

## 2. 验证

- [x] 2.1 增加 package baseline 与新 Workspace 初始化测试
- [x] 2.2 增加已有 Workspace sync、重复 sync 和旧 precise rule 保留测试
- [x] 2.3 运行 OpenSpec strict validation 与受影响 Product 验证

## 3. 当前认知与归档准备

- [x] 3.1 收敛 Brief、knowledge impact 与受影响实现文档
- [x] 3.2 核对 delta、实现和测试一致并准备 OpenSpec convergence
