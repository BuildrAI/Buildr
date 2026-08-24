## 1. Cleanup authority

- [x] 1.1 让 Task Environment Application 只从 persisted `completed + noChange=true` Task Record 派生内部 no-change cleanup 资格
- [x] 1.2 让 Git worktree provider 在 no-change cleanup 中证明 checkout clean 且 HEAD 与 Environment evidence 一致
- [x] 1.3 保持普通 completed Delivery evidence 与 abandon cleanup 路径不变，并同步 capability contract 与随包 Skill

## 2. Regression evidence

- [x] 2.1 增加 active → completed no-change → cleanup cleaned 的 Task Environment golden lifecycle 回归
- [x] 2.2 增加 clean unchanged、dirty 与 clean HEAD drift 的真实 Git provider 回归
- [x] 2.3 运行 focused integration、workspace contract check 与 Buildr fast verification

## 3. Knowledge and convergence

- [x] 3.1 对齐 Change Brief 与 knowledge impact evidence，确认没有新增长期术语或额外 current knowledge 目标
- [x] 3.2 通过 OpenSpec strict validation 与 convergence preflight
