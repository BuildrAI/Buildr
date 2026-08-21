# buildr-service-typescript-execution Specification

## Purpose

定义 Buildr Service 后端 TypeScript 的静态约束、Node 24 原生开发执行、混合模块加载、测试入口与正式发布物等价边界。

## Requirements

### Requirement: Buildr Service 必须提供受约束的后端 TypeScript 静态检查
Buildr Service MUST 为实际存在的后端 `.ts` 源码提供稳定 typecheck 入口，并 MUST 启用 `strict`、`noEmit`、`NodeNext`、`verbatimModuleSyntax` 与 `erasableSyntaxOnly` 等约束。TypeScript compiler 与 Node 类型 MUST 只作为开发依赖，正式 runtime dependency 不得因此增加。

#### Scenario: 对后端 TypeScript 执行静态检查
- **WHEN** 维护者在 Product 固定 Node 环境中运行 Buildr Service 的 typecheck 入口
- **THEN** 所有实际 `.ts` 生产源码 MUST 在不生成运行产物的情况下通过严格检查
- **AND** 不可擦除语法、隐式不安全类型或不符合 NodeNext 的模块引用 MUST 使检查失败

#### Scenario: 正式运行依赖保持不变
- **WHEN** Application Payload 生成 runtime package metadata 或 npm candidate inventory
- **THEN** TypeScript compiler、Node 类型包和 TypeScript development scripts MUST NOT 成为正式运行依赖或发布物内容

### Requirement: Development checkout 必须原生执行混合 TypeScript 模块图
Buildr development checkout MUST 使用 Product 声明的 Node 24.15.0 原生加载仅含可擦除类型语法的 `.ts`。`.mjs` 与 `.ts` MUST 使用显式相对扩展名互相引用，不得依赖额外 loader、路径别名或运行时转换器。

#### Scenario: MJS 入口加载 TypeScript 模块
- **WHEN** 固定 Node 从稳定 `bin/buildr.mjs` 进入 CLI Host，且执行路径包含 `.mjs -> .ts -> .mjs` 依赖
- **THEN** 代表性 CLI 命令 MUST 成功并保持既有输出协议
- **AND** 进程 MUST NOT加载 `tsx`、`ts-node` 或自定义 loader

#### Scenario: node:test 加载真实 TypeScript 切片
- **WHEN** 维护者通过固定 Node 运行覆盖该生产切片的 `node:test`
- **THEN** 测试 MUST 直接加载同一 `.ts` 源码并验证公开结果
- **AND** 测试 MUST NOT 使用预编译副本或重复实现替代被测模块

### Requirement: 正式 npm package 必须保持 TypeScript 源码无关的运行形态
Buildr Application Payload MUST 在构建阶段吸收被引用的 `.ts` 并继续生成单一、无拆分、无 sourcemap 的 Node 24 CommonJS runtime。正式 npm candidate MUST 只执行该冻结 runtime，MUST NOT 直接执行或携带后端 `.ts` 源码、TypeScript compiler或开发类型依赖。

#### Scenario: Application Payload 构建混合模块图
- **WHEN** Payload builder 从现有 release entry 打包包含 `.ts` 的生产依赖闭包
- **THEN** `runtime/buildr.cjs` MUST 构建成功且不保留 TypeScript 类型语法
- **AND** Payload 中代表性 CLI identity 结果 MUST 与 development checkout 等价

#### Scenario: npm candidate 在干净环境运行
- **WHEN** candidate tarball 安装到不含 development checkout、TypeScript compiler或 Service `node_modules` 的隔离 prefix
- **THEN** 已安装 `buildr` MUST 由兼容 Host Node 通过 CommonJS Application Payload 执行代表性 CLI 命令
- **AND** tarball inventory MUST NOT包含后端 `.ts`、TypeScript compiler或 Node 类型包

### Requirement: TypeScript 采用必须保持渐进且不改变公开行为
本轮 TypeScript 基础 MUST 只迁移用于证明执行闭环的最小真实生产切片。未触达 `.mjs` MUST 保持原状，迁移 MUST NOT 改变公开 CLI、HTTP、JSON、错误、数据模型、SQLite、事务、writer authority、运行副作用或 Verification 选择语义。

#### Scenario: 最小参考切片完成迁移
- **WHEN** CLI identity 参考切片从 `.mjs` 迁移到 `.ts`
- **THEN** 全部直接 import、测试和 Verification owner selector MUST 原子更新到新扩展名
- **AND** 旧路径 MUST 不再作为实现或兼容副本存在

#### Scenario: 未触达模块保持原状
- **WHEN** 本 Change 完成
- **THEN** 除明确参考切片外的既有 `.mjs` MUST NOT 因建立 TypeScript 基础被批量重命名或改写
- **AND** 产品材料 MUST NOT 声称这些未触达模块已经获得完整 TypeScript 类型安全
