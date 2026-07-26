## 1. Finish run 执行模型

- [x] 1.1 扩展 finish run 保存全部 attempt timing、retry attribution 和聚合 wall-clock evidence，并保持 v1 run 兼容读取
- [x] 1.2 增加结构化 execution plan 预检，核对 allowed cwd、receipt-bound executable、npm script 与 verification selector
- [x] 1.3 增加 fencing-bound lease renew，并把 lease 限制到显式共享写临界区
- [x] 1.4 增加 late asset-review checkpoint，只在首次 finalize 后 observation revision 变化时执行

## 2. OpenSpec convergence

- [x] 2.1 扩展 archive rehearsal，在调用 OpenSpec CLI 前聚合报告全部可检测的 Requirement/Scenario compatibility 问题
- [x] 2.2 增加 identity-bound convergence receipt/helper，固定 rehearsal、pre-sync、canonical sync、post-sync 顺序并拒绝事后 baseline

## 3. Verification process ownership

- [x] 3.1 让 verification runner 为 step 建立 task-owned process group，并在完成或异常时回收 owned descendants
- [x] 3.2 将 descendant cleanup status 纳入 verification timing/result evidence，并覆盖不影响其他进程的测试

## 4. 产品资产与验证

- [x] 4.1 更新 Task Finish Skill、capability contract/contribution、CLI JSON contract 和 package manifest 完整性
- [x] 4.2 完成 current knowledge reconcile 与术语核对，保持第二阶段 executor/约 3 分钟目标为非目标
- [x] 4.3 运行 unit、contract、fast integration 和 affected verification，修复全部回归
- [x] 4.4 冻结实现 Candidate，运行最终 required assurance 并记录完整 timing、cleanup 与 5–7 分钟目标观察
