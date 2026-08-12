## 1. Task Retrospective 核心

- [x] 1.1 实现 closed Result domain、terminal Task 校验、Application 与内部 driver
- [x] 1.2 增加 Workspace SQLite migration 和 current repository，覆盖首次写入、整值替换、回滚及 sibling records 隔离
- [x] 1.3 将 Task Retrospective 组合进 runtime，并增加 domain/application/repository tests

## 2. Agent 能力与旧能力退役

- [x] 2.1 交付 `buildr.task-retrospective/v1` contract、默认 Skill、manifest provider/binding 与产品入口路由
- [x] 2.2 从 Task Development 与其他 current consumers 移除 asset observation/finalize dependency 和 gate
- [x] 2.3 删除 `task-asset-review` contracts、Skill/helper/templates、bindings、active validation/tests，并增加 residual/package/runtime 验证
- [x] 2.4 验证 update/sync 不读取、迁移或删除既有 `.buildr/asset-review/` 数据

## 3. Local App

- [x] 3.1 增加 Task Retrospective 只读 API，返回 current Result 或 absent
- [x] 3.2 在 Task 详情增加“复盘”Tab，安全渲染 Markdown、完成时间和“尚未复盘”空态
- [x] 3.3 覆盖 API、web contract、browser smoke 与无写操作边界

## 4. 当前认知与验证

- [x] 4.1 更新 product/service/current knowledge、roadmap 与 capability 文档，保留未来扩展设计
- [x] 4.2 收敛 terminology、Brief 与 knowledge impact evidence
- [x] 4.3 运行 OpenSpec strict、package check、Doctor、affected verification 与 diff checks，并处理直接反馈
- [x] 4.4 确认 Change artifacts、实现和验证结果已具备 convergence/archive readiness
