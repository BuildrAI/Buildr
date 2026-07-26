## 1. Skill 重构

- [x] 1.1 重写随包 `task-worktree` description 与正文，按职责、决策、生命周期、协作交接、授权与停止条件组织，并保持 v2 contract 行为不变。
- [x] 1.2 对照 v2 contract 与 canonical specs，确认复用、artifact 收敛、发布保留/清理、单 Agent ownership 和 canonical 路径语义完整。

## 2. 验证约束

- [x] 2.1 更新 package 静态校验和 task-worktree contract tests，使其验证结构与稳定语义而不是旧句子。
- [x] 2.2 运行 OpenSpec strict/proposal contract guard、受影响测试和 capability graph 检查，确认 consumers 仍为 ready。

## 3. 当前认知与交付

- [x] 3.1 执行 current knowledge reconcile；无真实影响时记录 `not-applicable`。
- [x] 3.2 核对最终 diff、Skill 字数与 runtime 同步影响，准备后续 Task Finish。
