## 1. 收敛入口与 Skill 路由

- [x] 1.1 将 Product runtime Buildr Skill 的“收尾”路由拆分为 Formal Task Finish 与无 active Task 的直接 Git 收尾
- [x] 1.2 收窄 `task-finish` description，使其只匹配 formal Task handoff 收尾
- [x] 1.3 更新 `git-operations` description 与 playbook，说明无 Task 直接收尾由产品入口选择顺序、provider 只执行已选 operation

## 2. 固化契约与回归证据

- [x] 2.1 为 `direct-git-closeout` 新增 capability spec，并保留 `agent-task-workflows` 的完整 modified requirement
- [x] 2.2 增加或更新 contract/routing tests，覆盖无 active Task 路由、历史 Task 不复用、dirty scope、rebase 冲突、共享历史和无正式生命周期副作用
- [x] 2.3 运行 OpenSpec validate、package static validation 与受影响 Git/Task Finish contract tests，修复发现的不一致

## 3. 收敛与交付验证

- [x] 3.1 以当前实现和测试结果更新 Task Development Content Target、Verification policy 与结果
- [x] 3.2 完成 Change convergence、runtime sync/render 与 Codex workspace Doctor，确认 Formal Task Finish 路径仍保持原门禁
- [x] 3.3 检查精确 diff、Task/Environment/Change 状态和最终 Git 交付证据，形成 Finish handoff
