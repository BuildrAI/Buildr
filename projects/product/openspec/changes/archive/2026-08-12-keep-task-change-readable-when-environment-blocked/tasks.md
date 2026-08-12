## 1. Resolver 边界

- [x] 1.1 将 Task-scoped Project root 解析切换到 Environment saved-current reader，并对状态、scope identity、source path 与 root containment 做显式校验。
- [x] 1.2 保持候选/retained provenance、artifact 安全检查和 unavailable 回退语义不变。

## 2. 回归验证

- [x] 2.1 增加 ready、blocked-but-readable、路径失效和 Project scope 归属不可证明的 Resolver 回归测试。
- [x] 2.2 增加 Local App 通过 blocked saved Receipt 读取 candidate-only Change 的系统回归测试。

## 3. 知识与收敛

- [x] 3.1 更新受影响的 Buildr current knowledge 与 Change Brief，说明只读路径能力和 Environment 执行 readiness 的边界。
- [x] 3.2 核对术语与契约无未解决冲突，完成 OpenSpec strict validation，并为唯一 convergence transaction 准备 apply-ready Change。
