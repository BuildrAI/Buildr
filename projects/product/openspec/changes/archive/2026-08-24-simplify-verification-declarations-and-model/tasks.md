## 1. 当前模型与兼容入口

- [x] 1.1 固化 capability、profile、registry step、selection scope 与 verification target 的 as-is map
- [x] 1.2 增加公开 `daily-full` 入口并保留 `test:core` / `core` profile 的同集合兼容投射
- [x] 1.3 更新 capability declaration，明确对象、默认选择、决策、环境、副作用与 authority 边界

## 2. 契约与反例

- [x] 2.1 增加三轴模型、Task Content/Product Artifact Candidate 术语隔离与唯一 authority 契约
- [x] 2.2 用真实 planner 反例证明 affected 默认、合法 Full reason、daily-full Release-only 排除与 Candidate 覆盖闭合
- [x] 2.3 证明 `test:daily-full` 与兼容 `test:core` 选择同一 registry evidence set且不产生第二执行图

## 3. 当前认知与实现反馈

- [x] 3.1 同步验证框架、ownership 文档、Buildr Service 当前认知与术语表
- [x] 3.2 运行 OpenSpec strict、定点契约、可信 affected 反馈与完整日常 plan-only 反例
- [x] 3.3 收敛 brief、知识影响和兼容迁移诊断，不把模型清晰度包装成执行时间收益
