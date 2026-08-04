## 1. 只读接口与安全边界

- [x] 1.1 在 Local App HTTP 中增加 Workspace-scoped Task Development `GET`，只调用 Application `inspect` 并保持 query/no-store/非 GET 关闭式边界
- [x] 1.2 扩展 Task Local App 系统测试，覆盖 Development missing、已有 read model、未知 Task、query 和写方法零副作用

## 2. 任务详情信息架构

- [x] 2.1 将一级页签收敛为“概览、研发、证据、环境”，把既有 Review 与 Verification reader 组合为相互独立的证据区块
- [x] 2.2 实现研发视图的 missing、developing、candidate-current、handoff-current 与 unknown 展示，并保持 Task 顶层状态独立
- [x] 2.3 展示最小输入轴、候选代次、门禁、决定、风险和最近交接，明确 unknown 时历史事实保留但未实时复核
- [x] 2.4 收敛 Task 详情英文-only 和中英混杂文案，补充研发/证据布局及 1024px、390px 响应式样式

## 3. Current knowledge 与术语

- [x] 3.1 更新 Change Brief 与 knowledge impact evidence，保持 proposal、design、specs、实现和验收一致
- [x] 3.2 更新 Product overview、technical/product architecture、OpenSpec lifecycle flow、Buildr Service 说明和 Task lifecycle Roadmap 中的 Local App 当前投影与直接相关术语
- [x] 3.3 将 glossary 中本次使用的 `Development handoff`、`Delivery Carrier` 收敛为“研发交接（Development Handoff）”“交付载体（Delivery Carrier）”并核对相关引用
- [x] 3.4 更新随包 `task-development` Skill，明确 Local App 只消费 Application `inspect` 的只读投影且不提供 Development 写操作
- [x] 3.5 移除 canonical `task-development` 中“首版不得增加 Local App surface”的过时要求，以只读投影要求替代并继续禁止公共 CLI 与写操作

## 4. 验证与收敛

- [x] 4.1 更新 Local App 静态集成断言，证明四页签、中文主称、Application reader 和无直接 filesystem/writer
- [x] 4.2 更新浏览器 Task fixture 与流程，验证研发当前/缺失、证据组合、Agent Action、1024px/390px 无横向溢出并保留截图证据
- [x] 4.3 运行受影响测试、OpenSpec strict validation、current knowledge reconcile/inspect 与 Buildr proposal contract check
- [x] 4.4 将旧独立“审查”页签 requirement 显式迁移为新的“证据”组合视图 requirement，消除 OpenSpec 收敛歧义
