## Why

Buildr 的通用开发边界已有产品总规则。主程序的独立规则重复了这些要求，但现行自举布局仍把这份文件列为必需。按本次确认的审查结论，删掉重复内容，同时让智能体在仍需要就近判断的服务看到明确约束。

## What Changes

- 主程序不再强制有独立 `AGENTS.md`，撤下现有重复规则并同步布局校验。
- 精简 Buildr Web 与 Harness 后端规则；保留各自的会话、授权、验收、账号与数据边界。DSH 插件规则不变，Harness Web 不补文件。
- 不改变用户项目的规则、测试隔离、产品运行或发布行为，无用户侧破坏性变更。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `product-source-layout`：允许 Buildr 主程序没有独立服务级规则；其他布局要求不变。

## Impact

影响 Buildr 自用的服务规则、源码布局规范与本地验证；不涉及 API、数据迁移或运行时依赖。
