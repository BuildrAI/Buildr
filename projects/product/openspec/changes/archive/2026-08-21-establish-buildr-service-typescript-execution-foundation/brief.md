# 建立 Buildr Service TypeScript 执行基础

## 一句话摘要

Buildr Service 将以固定 Node 24、严格 no-emit typecheck、最小真实混合模块切片和现有 CommonJS Application Payload 建立可渐进采用的后端 TypeScript 基础。

## 背景与问题

Buildr Service 后续按能力单元重构时会持续创建、移动和拆分后端模块，但当前后端只有 `.mjs` 执行路径，缺少统一 TypeScript 静态约束、原生加载边界以及 development checkout 与正式 npm 发布物的等价证明。若直接由后续 Child 各自引入工具和配置，会产生多套运行路径、无法比较的验证证据和未受控的发布风险。

## 目标与非目标

目标是增加固定的 TypeScript 开发依赖、严格 `tsconfig.json`、稳定 typecheck 入口，并通过 CLI identity 真实生产切片证明 `.mjs -> .ts -> .mjs`、`node:test`、Application Payload 和 npm candidate tarball 的闭环等价。

本次不批量迁移全部 `.mjs`，不引入运行时转换器、路径别名、装饰器、JSON Schema、Ajv、DTO 生成或 buildr-web API 类型化，也不改变公开行为、数据模型、SQLite、事务、writer authority 或 Verification 语义。

## 受影响用户或角色

- 后续按能力单元迁移 Buildr Service 的维护者与 Agent。
- 维护 development checkout、Application Payload 和 npm candidate 的发布维护者。
- 依赖既有 CLI/HTTP/JSON 与本机数据兼容性的 Buildr 用户。

## 核心流程

1. Product 固定 Node 24.15.0 安装锁定的开发依赖并运行 no-emit typecheck。
2. 稳定 `.mjs` CLI Host 直接加载迁移后的 `.ts` identity 模块，该模块继续调用既有 `.mjs` Application/Infrastructure。
3. Development tests 直接运行同一混合模块图，不使用预编译副本。
4. esbuild 从现有 release entry 吸收 `.ts`，输出单一 CommonJS Application Payload。
5. npm candidate 只安装并执行冻结 Payload，不携带 TypeScript compiler、Node 类型包或后端 `.ts`。

## 关键变化

- 新增 Buildr Service 后端 `tsconfig.json`、typecheck script 与开发依赖。
- CLI identity 成为首个真实 `.ts` 生产切片，旧 `.mjs` 路径退出。
- Verification registry 增加低成本静态 typecheck 并更新相关 owner selector。
- Development checkout、node:test、Application Payload 与 npm candidate 增加混合模块和无 TypeScript runtime 依赖的等价断言。

## 影响、风险与兼容性

主要风险是 Node 原生可擦除语法与 TypeScript 检查边界漂移、扩展名消费者遗漏，以及开发路径成功但正式 Payload 失败。通过固定 Node/依赖版本、精确引用更新、静态与子进程测试、现有 Payload/candidate System tests共同失败关闭。公开行为与正式安装模型保持兼容。

## 验收摘要

- typecheck 在不生成产物的情况下拒绝非可擦除语法和不安全类型。
- 固定 Node 直接执行 `.mjs -> .ts -> .mjs` 的真实 CLI identity 路径。
- `node:test` 直接加载同一 `.ts` 生产模块。
- Application Payload 继续输出单一 CommonJS runtime，npm candidate 不含 `.ts`、compiler 或开发类型依赖。
- 未触达 `.mjs` 不被批量改写，全部公开 CLI/HTTP/JSON、数据与 writer authority 保持等价。

## 技术 artifacts 入口

- [Proposal](proposal.md)
- [Design](design.md)
- [TypeScript execution delta](specs/buildr-service-typescript-execution/spec.md)
- [Tasks](tasks.md)
