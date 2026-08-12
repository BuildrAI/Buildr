## 1. Task Finish Doctor 与恢复事实

- [x] 1.1 将 retained Doctor 改为使用 run 绑定的 Agent，并保持普通 Workspace failure fail closed
- [x] 1.2 在 Doctor blocked Result 中保存已完成的partial delivery、remote readback、activation与resume事实
- [x] 1.3 保持同一run resume、already-contained、cleanup和public JSON v2兼容

## 2. 自举 Workspace 专属恢复

- [x] 2.1 更新`task-finish@append`，明确覆盖普通Doctor停止规则的严格适用条件
- [x] 2.2 更新`buildr-self-bootstrap-sync`，支持complete post-Finish与Doctor-blocked same-run resume两条路径
- [x] 2.3 更新Component integrity并证明普通用户package/runtime不包含自举恢复逻辑

## 3. 自动化验证

- [x] 3.1 增加普通Workspace指定Agent Doctor失败、零cleanup和可恢复partial delivery测试
- [x] 3.2 增加自举Sync后同一run resume、最终Doctor和cleanup测试
- [x] 3.3 更新public JSON、CLI registry、package/runtime parity与Skill sequencing契约测试
- [x] 3.4 运行直接受影响反馈并修复全部回归

## 4. 当前认知与收敛准备

- [x] 4.1 更新Buildr产品说明和Task lifecycle architecture中的普通/自举Doctor判定边界
- [x] 4.2 对齐Brief、knowledge impact、术语和最终OpenSpec artifacts
- [x] 4.3 完成strict validation、实现核对和convergence/archive readiness检查
