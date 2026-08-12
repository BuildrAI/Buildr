## 1. Checklist reader 与 convergence gate

- [x] 1.1 提取并复用Change checklist parser，保持Local App progress与convergence相同的Markdown checkbox语义
- [x] 1.2 在任何receipt/canonical/archive写入前实现`change-checklist-incomplete`门禁与精确progress/next action

## 2. OpenSpec workflow authority

- [x] 2.1 更新propose/update/apply Component contributions，限定pre-disposition checklist并排除Formal Development、Finish、Metadata Publication、Environment cleanup与terminal state
- [x] 2.2 删除Task Finish convergence/archive旧authority，明确convergence/archive在stable Content Target与Formal Development之前完成

## 3. Verification 与当前认知

- [x] 3.1 增加convergence integration覆盖未完成项零写入、完成项正常归档与progress parser parity
- [x] 3.2 更新contract/package static验证，拒绝旧authority并保护Metadata Publication排除项
- [x] 3.3 更新OpenSpec Change lifecycle current knowledge，完成Brief/knowledge impact reconcile
- [x] 3.4 运行OpenSpec strict、Planning Review、focused与affected验证，确认全部Change-owned项达到archive readiness
