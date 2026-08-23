## 1. 统一 Finish 事实与安全边界

- [x] 1.1 建立 Product-owned Finish current facts 投影，统一 handoff applicability、repository topology、run/carrier ownership、side effects、remote containment 与四类维护结果
- [x] 1.2 将 carrier cleanup 与旧 run retirement 收敛为封闭、identity-fenced、可幂等验证的安全原语，并移除调用路径中的事故专用策略判断

## 2. Agent 主导的消费契约

- [x] 2.1 让自动 `run`、`reconcile` 与 `inspect` 消费同一 facts port，保持真实远端对账和既有 writer authority
- [x] 2.2 更新 Task Entry Snapshot/`task next`，投影 typed blockers、required 安全前置和 available capabilities，并保留有界兼容提示

## 3. 代表性验证

- [x] 3.1 增加 ownership、identity、side-effect containment、remote containment 与不安全删除的负向不变量测试
- [x] 3.2 增加未知 blocker、多策略选择、直接 Git/PR reconciliation、旧 run retirement 与多 repository partial delivery 的代表性旅程测试

## 4. 当前认知与 Change 收敛

- [x] 4.1 对齐 `brief.md`、`openspec/knowledge/architecture/technical.md`、`openspec/knowledge/services/buildr.md` 与适用术语，并更新 knowledge impact evidence
- [x] 4.2 完成实现期 focused/affected 反馈，严格验证 delta 与 canonical convergence readiness
