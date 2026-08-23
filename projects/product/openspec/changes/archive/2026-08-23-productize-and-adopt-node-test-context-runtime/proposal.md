## Why

上一轮已经证明公共 Node Test Context Runtime 能让首个 Task Application owner 的 focused 成本下降约 56%，但当前 Runtime 仍由未被 TypeScript 检查的 `.mjs` 实现，package subpath 没有可发布类型契约，绝大多数 eligible 重型 owner 也尚未接入。若不把它收敛为可复用的正式组件并完成 owner 审计，Buildr 仍会持续重复创建 Application、SQLite、Git 与 Workspace 临时世界，核心 Full 也无法从约 320–350 秒继续稳定下降。

## What Changes

- 将公共 Node Test Context Runtime 迁移为 TypeScript 权威源码，由独立构建生成标准 ESM JavaScript 与 `.d.ts`，消费者运行时不加载 TypeScript、实验性 type stripping 或 Buildr Workspace。
- 让 `@buildr-ai/buildr/test-context` 成为同时具有运行时和类型契约的稳定 package facade，并增加真实外部 TypeScript consumer、tarball inventory 和 checkout/package parity 验证。
- 为全部 Core/Candidate verification owner 记录可审计的 Context disposition；优先把 Task Coordination、Execution Records、Task Finish Application、Task Environment、Workspace read model 与 Runtime/Application composition 中所有 eligible 重型 owner 迁移到公共 Runtime。
- 对 Application、SQLite、Git/Workspace seed、process/CLI 分别采用 worker cache、snapshot、immutable seed + sandbox 和 worker-owned process；dirty state 必须 fail closed并evict，不能靠共享可变状态或不可靠 rollback 提速。
- 保留 System Task Finish、Self-bootstrap、Workspace/Worktree lifecycle、onboarding/init、Candidate tarball、Launcher、Host Node、Windows 与 Release smoke 的最低充分黄金生命周期，不以注册率或 180 秒目标为删减 primary evidence 的许可。
- 用同一冻结 tree 的 focused 多轮、Core 多轮以及 Core/affected 竞争记录 create/cache-hit/wait/body/reset/dirty/evict/materialize/cleanup、owner wall-clock 和残余长尾；若必要集合仍不能达到 180 秒，形成可复核下限和诚实预算结论。
- 更新完整验证框架文档，给出组件 API、Context 注册、owner disposition、并行/资源 grant、隔离/reset、接入决策和新增 owner 流程。

本变更不改变现有 CLI/HTTP/JSON 业务行为，不引入 Vitest，也不创建第二套 verification registry、runner、Candidate 或 tarball producer。公共 subpath 的类型声明是新增兼容能力，不是破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `node-test-context-runtime`: 增加 TypeScript 权威源码、确定性 ESM/`.d.ts` 构建、稳定类型推断和真实外部 TypeScript consumer 要求。
- `product-verification-quality`: 增加全部 owner disposition、eligible 重型 owner 迁移、逐 owner Context timing、黄金生命周期保留和 Core 成本验收要求。
- `buildr-service-typescript-execution`: 区分 CLI Application Payload 的单 bundle 规则与独立公共 ESM library subpath 的编译/声明产物规则，继续禁止正式运行加载源码 TypeScript。
- `cli-modular-architecture`: 收紧公共 Test Context facade 的 ESM、类型声明、发布依赖闭包和内部 deep import 边界。
- `npm-cli-package`: 要求唯一 npm tarball 发布公共 Test Context 的标准 JavaScript 与类型声明，同时排除 Buildr test-only provider、fixture、registry 和原始 Runtime TypeScript 源码。

## Impact

- 公共 Runtime：`services/buildr/src/infrastructure/testing/context-runtime/`、`services/buildr/test-context.mjs`、新增独立 TypeScript build/declaration pipeline。
- Buildr 测试适配层：`services/buildr/test/context/`、eligible Integration/System owner、Context-aware node runner。
- Verification 控制面：registry owner disposition、executor/timing evidence、owner coverage contract 和 Core/Candidate membership checks。
- Package：`package.json` exports/files/scripts、tarball inventory、外部 TypeScript consumer contract；不新增 runtime dependency。
- 文档与当前认知：完整验证框架、Buildr Service/technical architecture 与必要术语说明。
