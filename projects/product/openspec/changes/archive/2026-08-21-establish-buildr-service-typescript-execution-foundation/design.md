## Context

Buildr Service 当前以 `.mjs` 作为后端源码格式，development checkout 由 Product 固定 Node 24.15.0 启动，正式 npm package 则先由 esbuild 生成单一 CommonJS Application Payload，再从冻结 Payload 形成 candidate tarball。后续服务分层 Child 需要逐步创建或迁移 `.ts` 模块，因此必须先证明静态检查、Node 原生执行、混合模块边界和正式发布物仍使用同一行为闭环。

本 Change 只建立执行基础和一个最小真实生产切片，不取得后续能力模块迁移的范围。公开 CLI、HTTP、JSON、SQLite 与业务 writer 均保持不变。

## Goals / Non-Goals

**Goals:**

- 用 Service 根 `tsconfig.json` 和稳定 `typecheck` 入口约束后端 `.ts`。
- 证明 Node 24 development checkout 可以直接加载只使用可擦除类型语法的 `.ts`。
- 通过一个真实、低风险的 CLI identity 切片证明 `.mjs -> .ts -> .mjs` 混合加载。
- 让现有 esbuild Application Payload 吸收 `.ts` 并继续输出无拆分、无 sourcemap 的 CommonJS runtime。
- 让 typecheck、混合加载和发布物等价检查进入现有 Verification owner/affected 选择。

**Non-Goals:**

- 不批量把现有 `.mjs` 改名为 `.ts`，不宣称未触达代码已经类型安全。
- 不引入 `tsx`、`ts-node`、路径别名、装饰器、enum、namespace 或需要运行时转换的语法。
- 不引入 JSON Schema、Ajv、DTO 生成或 buildr-web API Client 类型化。
- 不改变正式 npm package 的 Host Node、Application Payload、安装来源或 Launcher 模型。
- 不改变公开行为、数据模型、SQLite schema、事务或模块 writer authority。

## Decisions

### 使用 Node 24 原生 TypeScript 作为 development 执行路径

新增或实际迁移的后端 `.ts` 只允许 Node 24 能直接擦除的类型语法；development checkout 与 `node:test` 继续由 Product 固定 Node 24.15.0 启动。相比引入 `tsx` 或 `ts-node`，这保持现有进程入口、失败模型和依赖边界不变，也避免出现第二套运行时转换链路。

### 使用 TypeScript `noEmit` 作为独立静态检查

Service 根新增 `tsconfig.json`，启用 `strict`、`noEmit`、`module/moduleResolution: NodeNext`、`verbatimModuleSyntax`、`erasableSyntaxOnly` 和显式相对扩展名约束。`typescript` 与 `@types/node` 固定为开发依赖，运行依赖保持不变。相比让 TypeScript 编译生产产物，`noEmit` 可以把静态检查与正式 esbuild Payload 分开，避免两套产物 authority。

### 用 CLI identity 作为最小真实混合模块切片

将低风险且已被 CLI Host 使用的 `src/bootstrap/cli/identity.mjs` 迁移为 `identity.ts`：调用方 `.mjs` 显式导入 `.ts`，该 `.ts` 继续导入现有 `.mjs` Application/Infrastructure 模块，并只增加参数类型等可擦除标注。这个切片覆盖真实 `buildr --version` 路径，又不改变命令路由、JSON schema 或业务状态。

相比创建仅用于演示的生产模块，迁移现有小切片能证明真实组合；相比迁移更大的业务模块，它把风险限制在只读 identity 输出。

### 正式 npm package 继续只执行 esbuild CommonJS Payload

Application Payload builder 继续以现有 `.mjs` entry 递归打包完整 runtime closure，esbuild 负责在构建阶段擦除 `.ts` 类型并生成 `runtime/buildr.cjs`。candidate tarball 只包含冻结 Payload、资源和薄 npm entry，不包含可执行 `.ts` 源码、TypeScript compiler 或开发类型依赖。开发 checkout 的原生 `.ts` 与正式 npm 的 CJS Payload 必须由同一 CLI identity case 证明结果等价。

### 把静态与交付证据接入现有验证编排

新增低成本 Static typecheck step，并让 `tsconfig.json`、`.ts`、package/lockfile 和相关测试进入 affected owner 映射。混合加载使用真实子进程 Integration case；Application Payload 与 npm tarball 继续由现有 Delivery/Release System tests 作为主证据，并补充不得包含 `.ts` 或 TypeScript runtime dependency 的断言。`verification.yml` 现有 `product.fast` 与 `product.delivery` 已覆盖对应编排入口，无需新增长期 capability。

## Risks / Trade-offs

- **Node 与 TypeScript 对可擦除语法的支持发生差异** → 固定 Product Node 24.15.0、锁定 TypeScript 开发版本，并让 typecheck 与真实 Node 子进程同时验证同一切片。
- **`.mjs`/`.ts` 扩展名更新遗漏消费者** → 使用精确引用搜索、CLI identity Integration case和 Verification owner audit共同失败关闭。
- **开发 checkout 可运行但正式 Payload 不可用** → 复用现有 Application Payload/candidate tarball System tests，并断言 tarball 不执行或携带 `.ts`。
- **typecheck 被误解为全部 JavaScript 已类型安全** → `tsconfig` 只把实际 `.ts` 作为检查目标，文档和测试不对未迁移 `.mjs` 作类型安全声明。
- **新增依赖扩大正式安装体积** → 只写入 `devDependencies`，Payload runtime metadata和candidate inventory继续排除开发依赖。

## Migration Plan

1. 增加锁定的开发依赖、`tsconfig.json`、`typecheck` script 和 Verification step。
2. 将 CLI identity 小切片迁移为 `.ts`，原子更新全部源码、测试和 owner selectors。
3. 增加 development checkout 混合加载与 node:test 证据。
4. 扩展 Application Payload/npm candidate 断言并运行 affected 验证。
5. 若 Node 原生执行、静态检查或发布物等价任一失败，回退该单一 `.ts` 文件与配置；不保留双实现或兼容副本。

## Open Questions

无。后续具体能力模块是否迁移为 `.ts` 由各自 Child 根据真实触达范围决定。
