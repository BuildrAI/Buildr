## 1. Plan 与 Receipt Domain

- [x] 1.1 实现 closed Environment Plan v1，校验完整 Task Service scope、not-applicable 与多步骤命令边界
- [x] 1.2 将 Environment Receipt 升级为 v4 Plan/Service/Step facts，并保留 v2/v3 只读兼容
- [x] 1.3 更新 public Environment/Plan JSON schema 与 Domain tests

## 2. Application 与 CLI

- [x] 2.1 增加 Plan record/inspect Application actions和SQLite current原子写入
- [x] 2.2 重构prepare为通用Step执行、逐步落盘、部分恢复与聚合readiness
- [x] 2.3 保持live inspect严格只读，按Plan/executable/input/output facts报告missing/drifted/failed
- [x] 2.4 增加Plan CLI actions与`prepare --plan`，更新help、registry和checkout/npm parity

## 3. Consumer 与自举迁移

- [x] 3.1 删除Product `task-environment.yml`和npm专用declaration parser/registry
- [x] 3.2 更新Task Environment/Triage Skill、contract、CLI文档和current knowledge
- [x] 3.3 更新Local App API read model与Environment Tab展示Plan、Service和Step

## 4. 自动化验证

- [x] 4.1 增加多Service、多Step、not-applicable、scope缺失和Plan替换测试
- [x] 4.2 增加非npm executable、partial recovery、input/executable drift、failure与只读inspect测试
- [x] 4.3 更新fresh Buildr/buildr-web system proof，确认受管npm、worktree-local outputs与`npm run build:web`
- [x] 4.4 更新package/schema/Local App fixtures并通过affected tests与browser smoke

## 5. 收敛准备

- [x] 5.1 对齐Brief、technical architecture、Service/current terminology和knowledge impact evidence
- [x] 5.2 通过OpenSpec strict validation、完整Product Candidate与fresh-environment集成证明
- [x] 5.3 运行deterministic converge/archive并确认Change可进入Task Development稳定Content Target
