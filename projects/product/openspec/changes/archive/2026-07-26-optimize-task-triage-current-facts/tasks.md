## 1. 契约与当前认知基线

- [x] 1.1 创建 Change Brief 和 knowledge impact evidence，核对术语与受影响 current knowledge
- [x] 1.2 新增 `current-knowledge-maintenance/v2` 与 `task-board-maintenance/v1` contracts，并更新 provider、consumer 和 initial bindings

## 2. Skill 与随包资产

- [x] 2.1 将 `task-triage` 重构为三轴决策、条件状态输出和 selected-provider 交接
- [x] 2.2 为 current-knowledge provider 实现独立 `maintain` operation 与结构化结果
- [x] 2.3 使 task-board provider、模板和 metadata 支持零个 OpenSpec change，并实现任务看板 capability
- [x] 2.4 更新 package baseline、Component integrity、runtime contribution 和产品当前认知入口

## 3. 组合验证

- [x] 3.1 更新 package static validation 和 capability graph tests，覆盖 v1/v2 兼容与 optional branch readiness
- [x] 3.2 更新 task-triage、task-board、worktree、current knowledge 契约测试，覆盖 repository set、独立 maintain 和无 change 看板
- [x] 3.3 运行 OpenSpec strict/proposal contract gates 和受影响验证，修复发现的问题

## 4. 最终收敛

- [x] 4.1 运行 current knowledge reconcile，确认 Skill、contracts、specs、knowledge 与最终 tree 一致
- [x] 4.2 渲染 Codex runtime、运行 doctor 并核对受影响 provider/consumer readiness
