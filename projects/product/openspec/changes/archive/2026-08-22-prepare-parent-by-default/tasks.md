## 1. Parent 创建与准备工作流

- [x] 1.1 更新 `task-manager` 的触发描述与成功交接，明确 active Parent 创建后在对应用户意图下自动交给 `task-development`，同时保持 Task Record 单一 writer。
- [x] 1.2 更新 `task-development` 的 Parent 准备循环，按 current `task next` 和 Parent Coordination 逐步调用 owner，信息充分时记录完整 Parent Plan，并只在真实 blocker 或 `start-child-contribution` 停止。
- [x] 1.3 更新 `task-triage` 的 Parent 创建入口，区分 todo/纯记录意图与“创建并准备到可启动 Child”，并禁止创建成功后提前返回。

## 2. 规范、知识与验证

- [x] 2.1 收敛 `agent-task-workflows` delta spec 与相关 Buildr current knowledge，保持 Task Record/Application writer 边界和 Skill 编排说明一致；canonical spec 只由最终 convergence 事务更新。
- [x] 2.2 增加 Parent 默认准备的 Skill contract tests，覆盖自动交接、owner 循环、已知规划输入、真实 blocker 与 Child 前停止点。
- [x] 2.3 同步随包 workspace 资源，运行 OpenSpec strict/preflight、受影响 contract tests、Skill/manifest 校验与 Product affected verification，并修复全部当前失败。
