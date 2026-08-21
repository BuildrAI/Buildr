## Why

Buildr Service 后续按能力单元渐进重构时需要创建、移动和拆分新的后端模块，但当前后端只有 JavaScript 执行与验证入口，缺少统一的 TypeScript 静态约束、原生执行边界和发布物等价证明。现在先建立最小执行基础，可以让后续 Child 在不批量改写既有 `.mjs`、不改变公开行为的前提下安全采用 `.ts`。

## What Changes

- 为 Buildr Service 增加 Node 24 原生可擦除 TypeScript 的开发与测试执行约束。
- 增加 `strict`、`noEmit`、`NodeNext`、`verbatimModuleSyntax`、`erasableSyntaxOnly` 的后端 TypeScript 静态检查入口。
- 用最小真实模块切片验证 `.mjs` 与 `.ts` 双向加载、`node:test` 和 development checkout CLI 路径。
- 让 Application Payload 与 npm candidate tarball 继续使用可独立运行的构建结果，正式安装不得直接执行 `node_modules` 中的 `.ts`。
- 将 TypeScript 与 `@types/node` 保持为开发依赖，不引入 `tsx`、`ts-node`、路径别名、装饰器或需要运行时转换的 TypeScript 语法。
- 不批量重命名既有 `.mjs`，不改变公开 CLI、HTTP、JSON、错误、数据模型、SQLite、writer authority、运行副作用或 Verification 语义。
- 本 Change 不包含破坏性变更。

## Capabilities

### New Capabilities

- `buildr-service-typescript-execution`: 定义 Buildr Service 后端 TypeScript 的静态约束、Node 24 原生开发执行、混合模块加载、测试入口与正式发布物等价边界。

### Modified Capabilities

无。

## Impact

- 影响 `projects/product/services/buildr` 的 package metadata、lockfile、TypeScript 配置、最小参考模块与测试、Application Payload 构建和相关 Verification owner 映射。
- 增加开发依赖 `typescript` 与 `@types/node`，不增加运行依赖。
- 影响 development checkout、`node:test`、Application Payload 和 npm candidate tarball 的验证组合；不影响 sibling `buildr-web` 的前端 TypeScript authority。
