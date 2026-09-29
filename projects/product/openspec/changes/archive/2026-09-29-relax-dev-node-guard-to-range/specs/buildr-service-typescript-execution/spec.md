## MODIFIED Requirements

### Requirement: Development checkout 必须原生执行 TypeScript 源码图
Buildr development checkout MUST 使用开发 Node 范围内选定的 Node 原生加载仅含可擦除类型语法的 `.ts`。开发 Node 范围指与 Product 声明版本（`.node-version`）同主版本且不低于该声明版本，当前为 `>=24.15.0 <25`；声明版本继续作为受控供给环境的锚点。人工维护的生产、工具和普通测试源码 MUST 使用显式 `.ts` 相对扩展名，不得依赖额外 loader、路径别名或运行时转换器。

#### Scenario: 稳定入口加载 TypeScript 模块
- **WHEN** 开发 Node 范围内选定的 Node 从稳定 `bin/buildr.mjs` 进入 CLI Host，并继续执行 `.ts` 源码图
- **THEN** 代表性 CLI 命令 MUST 成功并保持既有输出协议
- **AND** 进程 MUST NOT加载 `tsx`、`ts-node` 或自定义 loader

#### Scenario: node:test 加载真实 TypeScript 切片
- **WHEN** 维护者通过开发 Node 范围内选定的 Node 运行覆盖该生产切片的 `node:test`
- **THEN** 测试 MUST 直接加载同一 `.ts` 源码并验证公开结果
- **AND** 测试 MUST NOT 使用预编译副本或重复实现替代被测模块
