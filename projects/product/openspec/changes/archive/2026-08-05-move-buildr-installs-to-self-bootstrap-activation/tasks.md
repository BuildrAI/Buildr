## 1. 共用 Task Finish 边界

- [x] 1.1 从 Product executor移除CLI/Local App路径分类和installer/launcher调用，保留通用render、Doctor、push/readback与cleanup
- [x] 1.2 调整Finish v2 Result兼容字段和terminal delivered判断，证明旧v2 Result仍可安全读取且新delivered不依赖产品安装
- [x] 1.3 更新共用Task Finish contract、Skill与CLI架构说明，移除development install权责且不引入self-bootstrap slot

## 2. Buildr自举activation

- [x] 2.1 将`buildr-self-bootstrap-sync`收敛为单一post-Finish activation Skill，按冻结Task Contribution分类并去重sync/CLI/Local App/Doctor动作
- [x] 2.2 更新`buildr-self-bootstrap` Contribution与Component integrity，保持Component ID和单一orchestrator
- [x] 2.3 更新Buildr自举Workspace的Product规则与当前认知，移除“所有CLI源码改动都由通用Finish安装”的旧边界

## 3. 验证覆盖

- [x] 3.1 补齐Unit/Integration测试：通用Finish零installer调用、terminal兼容、self-bootstrap分类去重与失败语义
- [x] 3.2 补齐System/Browser与临时用户Workspace fixtures：用户Workspace无Product checkout/自举资产/launcher副作用，Finish仍delivered并cleanup
- [x] 3.3 补齐package/runtime parity：共用Skill无自举slot、用户package不含专属能力、自举Component投射正确

## 4. Change收敛准备

- [x] 4.1 执行current knowledge reconcile与术语核对，确保Brief/spec/实现一致且无unresolved项
- [x] 4.2 运行focused测试、上游strict validation与受影响验证反馈，修复所有失败
- [x] 4.3 使用`buildr openspec converge`同步canonical specs并归档Change，确认受影响文件identity与archive readiness
