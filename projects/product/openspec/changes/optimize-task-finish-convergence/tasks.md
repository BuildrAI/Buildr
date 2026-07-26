## 1. 收尾编排与 Rehearsal

- [x] 1.1 更新 `task-finish` capability contract 与 Skill，使 pre-sync receipt 成为 canonical sync 的唯一授权，并定义 receipt/delta/canonical 失效后的返回阶段。
- [x] 1.2 更新 archive rehearsal helper：在复制 planning root 前解析并校验绝对 OpenSpec executable，拒绝隔离副本中的相对路径猜测。
- [x] 1.3 为正常收敛、过早 canonical 写入、receipt stale 与相对 executable 添加 Task Finish / helper tests。

## 2. OpenSpec 同步诊断

- [x] 2.1 扩展 `openspec-contract-guard` result schema 和 post-sync finding，提供 operation、expected/actual 摘要及确定性 next action。
- [x] 2.2 为 MODIFIED Requirement 不完整、未触达 Requirement 变化和 pre-sync 前 canonical 写入添加 contract fixtures。
- [x] 2.3 保持既有 baseline、receipt 与 JSON consumer 的兼容性，并补充静态/集成覆盖。

## 3. 验证成本与当前认知

- [x] 3.1 更新 `task-verification` contract/provider，使正式验证 wall-clock 不混入 consumer workflow checks。
- [x] 3.2 更新 Task Finish 最终报告，分别呈现验证、收敛检查和失效/重试成本，且不重复启动可复用验证。
- [x] 3.3 执行 current knowledge reconcile，更新受影响的 OpenSpec lifecycle flow 与 Change Brief/impact evidence；确认术语无需新增。

## 4. 验证与同步

- [x] 4.1 运行受影响的 unit、contract、integration 与 OpenSpec strict validation，记录实际 timing 和失败/跳过项。
- [x] 4.2 建立 contract baseline，运行 proposal/pre-sync/post-sync guards，并按结果同步 canonical specs。
- [ ] 4.3 在最终 delivery tree 运行 Project required assurance、doctor 与 managed asset integrity checks。
