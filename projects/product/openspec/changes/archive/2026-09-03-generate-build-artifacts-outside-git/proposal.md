## Why

Buildr 当前把可由权威源码、Schema、锁文件和固定工具链重建的 `web-dist`、公共测试上下文运行代码与声明、两端 HTTP DTO 一并提交到 Git，形成重复状态、哈希文件噪音和额外漂移门禁。当前候选产物（Candidate Artifact）已经具备隔离构建与唯一冻结能力，应让 Git 只保存人工源码和构建输入，由同一候选构建产生、验证并交付全部生成物。

## What Changes

- 新增统一的构建产物暂存（Build Artifact Staging），在系统临时目录或明确忽略的本地输出中，从当前源码、Schema、锁文件和固定工具版本确定性生成 HTTP DTO、公共测试上下文 ESM/`.d.ts`、Buildr Web `web-dist` 与应用负载（Application Payload）。
- 从 Git 删除 `services/buildr/web-dist/**`、`services/buildr/package/targets/test-context/**` 以及前后端 `src/**/generated/*-dto.ts`，并以精确忽略规则防止重新提交；`package-lock.json`、Schema、迁移、产品资源和有明确兼容目的的运行代码夹具继续受源码管理。
- 开发检查在消费生成类型或静态产物前按需生成本地忽略输出；浏览器验证直接托管本次隔离构建的 `web-dist`，不再与 tracked `web-dist` 比较。
- 候选产物构建只生成一次并冻结同一组输出；应用负载和唯一 npm 压缩包只消费冻结结果，发布包继续包含可执行运行代码、公共类型声明和可同源托管的 Buildr Web 静态资源，不依赖开发源码或构建工具。
- 将现有漂移检查从“源码与 tracked 生成文件比较”改为“相同输入重复生成一致、生成清单闭合、消费者类型检查/行为验证和候选清单验证”。
- **BREAKING**：维护者的干净检出不再自带 `web-dist`、生成 DTO 或公共测试上下文编译输出；首次类型检查、Web 运行或候选构建必须经过声明的生成/构建入口。公开 CLI、HTTP、JSON、SQLite、npm 子路径和运行行为保持兼容。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `product-source-layout`: `web-dist`、公共测试上下文输出和 HTTP DTO 不再属于 tracked 源码树，顶层目录与允许清单改为源码/本地输出分离。
- `buildr-service-typescript-execution`: 类型检查覆盖生成器与消费者，并从按需生成结果验证公共库，不再要求 tracked 编译输出。
- `node-test-context-runtime`: 公共 ESM 与声明在候选暂存中生成、验证并发布，漂移判断不再依赖仓库副本。
- `http-contract-reference-pipeline`: 两端 DTO 由同一 Schema 在构建前生成到忽略输出，确定性和消费闭包替代 tracked 文件比较。
- `task-professional-http-contracts`: 专业 Task DTO 与类型化客户端改为构建期生成和验证，不再要求两端 tracked DTO。
- `runtime-system-http-contracts`: Runtime/System DTO、正式 Web 构建与发布等价性改为绑定同一生成批次和候选产物。
- `buildr-web-browser-verification`: 浏览器验证托管隔离生成并冻结的 Web 构建，不再读取或比较 tracked `web-dist`。
- `buildr-web-service`: 本地开发输出可写入忽略目录，候选/打包输出写入隔离暂存；已安装包仍携带完整 `web-dist`。
- `buildr-application-payload`: Payload builder 接收同一候选暂存中的冻结 Web 与公共库输入，而不是从 tracked Service 目录复制。

## Impact

- 受影响服务：`product/buildr`、`product/buildr-web`。
- 受影响实现：TypeScript/DTO 生成脚本、Vite 输出配置、Test Context 编译、Browser smoke、Application Payload、npm Candidate、package inventory、验证 registry、`.gitignore`。
- 受影响规范与知识：上述九个 canonical specs、Buildr Service 技术架构、验证框架、Service 说明和构建/验证声明。
- 依赖保持：TypeScript、Vite、esbuild、Ajv 与 `json-schema-to-typescript` 继续是开发/构建依赖，不进入正式运行依赖。
- 兼容性：发布包内容与公开入口保持；仅维护者直接依赖 tracked 生成物的工作方式需要迁移到正式生成入口。
