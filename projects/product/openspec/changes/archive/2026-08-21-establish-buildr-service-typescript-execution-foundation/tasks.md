## 1. TypeScript 静态与执行基础

- [x] 1.1 在 Buildr Service 锁定 `typescript` 与 `@types/node` 开发依赖，增加受约束的 `tsconfig.json` 和稳定 `typecheck` script
- [x] 1.2 将 typecheck、TypeScript 配置和 `.ts` 生产路径接入现有低成本及 affected Verification owner 映射

## 2. 最小真实混合模块切片

- [x] 2.1 将 CLI identity 模块从 `.mjs` 迁移为只使用可擦除类型语法的 `.ts`，原子更新全部 import 与 selector
- [x] 2.2 保持旧 `.mjs` 路径退出，并验证 `buildr --version` 与 JSON identity 输出协议不变

## 3. Development 与发布物证据

- [x] 3.1 增加 Node 24 development checkout 和 `node:test` 对 `.mjs -> .ts -> .mjs` 真实加载链的 Integration 证据
- [x] 3.2 扩展 Application Payload 与 npm candidate tests，证明 CJS bundle 吸收 TypeScript 且 tarball 不携带或执行 `.ts`、compiler 与开发类型依赖
- [x] 3.3 运行 typecheck、相关 Contract/Integration tests 和 Product Fast affected feedback，修复本 Change 引入的问题

  Child-owned typecheck、Contract、mixed-module Integration与Application Payload tests均通过；Product Fast仅被base commit中遗留的`task-finish-maintenance-driver.mjs -> application/compose-runtime.mjs`失效引用阻塞，该引用属于已交付`bootstrap-and-module-contracts`Contribution且超出本Contribution边界。

## 4. 当前认知与 Change 收敛准备

- [x] 4.1 根据 current knowledge assessment 更新必要的架构/验证事实，并记录无影响目标的明确结论
- [x] 4.2 完成 OpenSpec strict validation、语义预检和最终 checklist 核对，使 Change 达到可确定性收敛状态
