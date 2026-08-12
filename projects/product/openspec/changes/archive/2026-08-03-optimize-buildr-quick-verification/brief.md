# 优化 Buildr Quick 验证反馈

## 一句话摘要

把 Project Testing 的真实测试边界落实到 Buildr registry，使 `npm test` 成为低成本 Quick 入口，同时完整保留任务相关与候选回归。

## 背景与问题

现有 `fast` 整体执行重型 `integration-fast`，约需 60–96 秒；`test:unit` 也混入真实文件系统、Git 和进程测试，约需 20 秒。入口名称、执行边界与实际成本不一致，开发期反馈过慢。

## 目标与非目标

- 目标：逐 step 记录测试分类与 owner，恢复 Unit/Component/Integration 边界，缩短 Quick。
- 非目标：不改 Task Verification schema/Result，不削弱 Candidate，不建设通用测试或 QA 平台。

## 受影响角色

主要影响维护 Buildr 的 Agent 和开发者；用户 workspace 的验证声明格式和业务行为不变。

## 核心流程

研发期运行 Quick 获得低成本反馈；按变更 owner 运行 Task-affected Integration；冻结候选后运行完整 Candidate。

## 关键变化

- registry step 增加可校验的 Project Testing 分类和目标成本。
- 新增窄 Component 入口，真实技术边界测试归回 Integration。
- `test:fast` 不再默认执行整个 `integration-fast`。

## 影响、风险与兼容性

现有 npm Fast 命令保持兼容；历史 `integration-fast` 名称暂不重命名。退出 Quick 的测试仍由 changed/focus 和 Candidate 执行，测试内容不删除。

## 验收摘要

本轮实测 Unit 由 20.02 秒降至 0.27 秒，Component 为 0.13 秒，迁移后的 Integration 为 19.23 秒，`npm test` Quick 为 6.31 秒；测试内容未删除，重型 System 集合仍完整保留在 Candidate。最终交付仍以冻结候选上的完整 Candidate、OpenSpec strict 与 Task Verification Result 为准。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Delta spec](specs/cli-modular-architecture/spec.md)
- [Tasks](tasks.md)
