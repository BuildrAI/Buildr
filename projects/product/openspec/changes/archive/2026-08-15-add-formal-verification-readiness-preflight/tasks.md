## 1. Application 边界

- [x] 1.1 让 Task Development `observe` 在任一关联 Change 为 `pending` 时零写入阻止，并保留空 Change、`not-applicable` 与已归档 Change 的合法路径
- [x] 1.2 派生 response-only `formalVerificationReadiness`，覆盖 `not-applicable`、明确 `blocked` 与 current knowledge 待确认的 `unknown`
- [x] 1.3 在 compact Task Development 与 Task Entry Snapshot 中投影 readiness，并让 typed next 在昂贵 Formal Verification 前指向最小 owner 动作

## 2. Workflow 与契约

- [x] 2.1 更新 Task Development capability contract/Skill，说明只读 readiness、瞬时 current knowledge inspect 与直接进入 Formal Verification 的边界
- [x] 2.2 更新对应 JSON contract/contract assertions，保持 Receipt、Verification executor、开发期测试和 Candidate CI 无新字段或依赖

## 3. 验证反馈

- [x] 3.1 增加 `observe` pending/空 Change/not-applicable 的 Application 回归测试
- [x] 3.2 增加 readiness 派生、compact projection、Task Entry next 与 closed JSON shape 测试
- [x] 3.3 运行 OpenSpec strict validation 与 Buildr affected/focused feedback，修复本 Change 引入的问题

## 4. 当前认知与归档准备

- [x] 4.1 收敛 Change Brief、knowledge impact 与真正受影响的 Task workflow/Service current knowledge，并完成术语检查
- [x] 4.2 核对全部 checkbox、delta specs、实现、测试与 current knowledge 一致，使 Change 达到 deterministic convergence/archive readiness
