## 1. Authority 与 Schema

- [x] 1.1 固化 Development、Verification、Review、Local App、Finish 与 Metadata Publication 的 authority/consumer/read/write 审计矩阵
- [x] 1.2 增加连续 SQLite migration，建立三个窄 current-state tables、foreign keys、slots 与必要 indexes
- [x] 1.3 覆盖 fresh schema、连续升级、ledger/checksum、foreign keys 与失败 rollback
- [x] 1.4 补齐全部Requirements清退时canonical capability spec的隔离投影、原子删除、恢复与observer evidence

## 2. 专业 Repository 切换

- [x] 2.1 实现 Task Development SQLite repository并切换composition root，旧YAML保持inert
- [x] 2.2 实现 Task Verification SQLite repository并保持digest/applicability与错误语义
- [x] 2.3 实现 Task Review SQLite repository并保持planning/completion独立slot与失败隔离
- [x] 2.4 验证CLI、Skill、Local App、Development/Candidate/handoff与Finish consumers只经Application工作

## 3. Metadata Publication 清退

- [x] 3.1 删除publication Skill、contract、helper、provider/binding、package/runtime source与专项tests
- [x] 3.2 删除Git Operations及其他consumer routing/requirement，并加强package/capability residual validation
- [x] 3.3 通过候选runtime fixture验证sync不再投射publication Skill且Doctor capability graph无残留

## 4. 产品事实与文档

- [x] 4.1 更新Task lifecycle讨论稿、current knowledge、canonical spec deltas与Workspace Structured Store说明
- [x] 4.2 更新CLI/reference/architecture/known limitations/Roadmap与JSON/capability contract描述
- [x] 4.3 全仓审计current source、specs、docs、help与tests中publication/YAML authority残留，保留历史archive原文
- [x] 4.4 修正formal verification发现的隐藏consumer，并补齐portable/publication旧语义的canonical deltas与current文档清理

## 5. 验证与交付

- [x] 5.1 运行受影响unit、contract、integration、system与static验证并修复回归
- [x] 5.2 完成current knowledge reconcile、OpenSpec strict validation与Change-owned验收证据
