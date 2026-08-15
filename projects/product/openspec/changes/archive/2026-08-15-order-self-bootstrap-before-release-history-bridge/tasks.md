## 1. 发布顺序与 bridge 门禁

- [x] 1.1 在 `bridge-main-to-dev.mjs` 中实现有界、非 symlink 的 self-bootstrap closeout evidence 解析，以及 run/plan/phase/live dev ref 校验
- [x] 1.2 更新 `buildr-release`，在 release Task Finish 后、pre-main convergence 前运行 matching self-bootstrap runner，重新冻结 candidate tree，并把 evidence 传给 history bridge
- [x] 1.3 更新发布检查清单与失败恢复说明，明确不得 bridge 后补跑 activation

## 2. 验证与契约

- [x] 2.1 扩展 release history bridge 测试，覆盖 passed、not-applicable、缺失、失败、run/ref 不匹配与零副作用失败
- [x] 2.2 补充发布 Skill/自举顺序契约断言，并确认 changed verification plan 覆盖 release 与 self-bootstrap owner
- [x] 2.3 运行 OpenSpec strict/preflight、focused/changed 反馈验证并修复发现

## 3. 当前认知与收敛准备

- [x] 3.1 创建 Change Brief 与 knowledge impact evidence，并更新受影响的 Buildr Service/发布流程当前认知
- [x] 3.2 对最终实现执行 current knowledge reconcile、术语检查与 OpenSpec strict validation
- [x] 3.3 确认全部实现任务完成并进入 deterministic convergence/archive readiness
