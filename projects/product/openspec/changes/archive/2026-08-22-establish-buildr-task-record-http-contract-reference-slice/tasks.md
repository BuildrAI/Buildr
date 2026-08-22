## 1. 契约 Authority 与生成基础

- [x] 1.1 增加 Ajv/DTO 生成依赖、通用 strict Draft 2020-12 compiler，以及 Task-owned 五操作 Schema/operation catalog。
- [x] 1.2 实现确定性后端/前端 DTO generator、tracked generated 文件与 drift check，并覆盖生成一致性和未迁移诊断。

## 2. Buildr HTTP 参考切片

- [x] 2.1 将 Task list/detail/update/complete/abandon 接入复用 validator 与显式 Interface DTO → Application mapping，保持现有安全和错误优先级。
- [x] 2.2 建立真实 HTTP Contract Test，覆盖合法请求、成功/错误 Schema、未知/缺失/非法字段、不变异和 Application writer 未被误调用。

## 3. Buildr Web 类型化消费

- [x] 3.1 新增 Task 能力级 typed Client，并迁移 Task 列表/详情的五操作调用点，移除对应手写 HTTP DTO 与响应断言。
- [x] 3.2 通过生成物 drift check、两端 typecheck、Buildr Web 正式 build 与 Task Browser Smoke 验证 Schema → 页面链路。

## 4. 当前认知与收敛准备

- [x] 4.1 完成 Change Brief、knowledge impact evidence，并将最终机制/边界同步到 technical architecture 与 buildr/buildr-web Service 当前认知。
- [x] 4.2 运行 focused/affected 产品验证、OpenSpec strict/preflight 和最终 current knowledge reconcile，修复本 Change 范围内的失败并确认可确定性收敛。
