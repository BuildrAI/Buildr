## 1. Parent Coordination read model

- [x] 1.1 在 Parent Coordination startup projection 中追加 response-only `dependencyBlockers`，保持既有字段和 writer authority 不变
- [x] 1.2 补充 Parent Coordination integration test，覆盖存在 eligible 项时仍可读取其他 Contribution 的依赖等待事实

## 2. Buildr Web 协调视图

- [x] 2.1 为 Parent Coordination 公开响应建立显式 TypeScript 类型和纯展示 helper
- [x] 2.2 抽出页面局部 `ParentCoordinationPanel`，优先展示当前状态、下一步、名称与编号、真实阻塞和最终验收进度
- [x] 2.3 修复 Planning Review 字段映射，并保留 Child 承担、交付证明、历史 Task 空态和稳定 DOM 钩子
- [x] 2.4 增加局部响应式样式，保证 390px 视口不横向溢出且不引入新依赖或远程资产

## 3. 实现级回归覆盖

- [x] 3.1 更新前端 contract/integration 测试，锁定名称与编号、startup/final acceptance 分层和 Planning Review 映射
- [x] 3.2 更新生产托管 browser smoke，验证 Parent Plan 模式与 legacy 空态
- [x] 3.3 构建 buildr-web 并确认 buildr `web-dist` 消费路径与现有同源托管约束保持一致

## 4. 当前认知收敛

- [x] 4.1 在实现完成后更新 Change Brief，并核对 Buildr、buildr-web 与技术架构当前认知
- [x] 4.2 核对既有 Parent Plan、Parent startup、Contribution Handoff 与 Planning Review 术语边界，无新增长期术语时不改 glossary
