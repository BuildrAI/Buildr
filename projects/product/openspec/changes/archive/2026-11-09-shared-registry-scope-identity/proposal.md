# 共享登记守卫按文件身份判定并强制测试隔离

## Why

开发版真实 `workspace-registry.json` 被混入多条 `/tmp/buildr-*/ws` 测试工作空间。根因有两层：

- 临时目录守卫 `isSharedRegistryScope()` 以 `webProfile.overridden !== true` 判定共享范围，而 `overridden = Boolean(options.dataRoot || env.BUILDR_APP_DATA_DIR)`。智能体运行环境为管理真实开发版实例本就设置 `BUILDR_APP_DATA_DIR=…/Buildr Dev`，于是覆盖变量被当作"已隔离"而跳过守卫，写入却仍落在该变量指向的真实共享登记文件。
- 测试辅助工具 `runBuildr`/`runBuildrAsync` 仅在 `BUILDR_APP_DATA_DIR` 未设置时才造隔离数据根；智能体环境恒设该变量，导致测试继承真实数据根。

规范 `buildr-web-workspace-application` 的"共享登记列表拒绝临时根"也把"未被覆盖"错误等价于"写入共享文件"，并规定显式覆盖一律允许临时位置，使上述绕过在契约层也被放行。

## What Changes

- 共享范围判定改为按**本次写入的登记文件是否就是该 Profile 的共享长期登记文件**（文件真实身份，含符号链接归一），不再按是否设置覆盖变量。覆盖变量指向共享数据根时仍拒绝临时根；指向独立隔离目录时继续允许。
- 测试辅助工具默认强制隔离数据根，不再依赖"覆盖变量未设置"这一在智能体环境中恒假的前提。
- 修正规范条款措辞与场景，新增"覆盖变量指向共享数据根仍拒绝临时目录"场景。

## Capabilities

### Modified

- `buildr-web-workspace-application`: "共享登记列表拒绝临时根" Requirement 改为按写入文件真实身份判定共享范围。

## Impact

- 代码：`services/buildr` workspace 登记守卫（`workspace-registry-repository.ts`）、测试辅助工具（`test/helpers/workspace-product-suite.ts`）、相关集成测试。
- 规范：`openspec/specs/buildr-web-workspace-application/spec.md`。
- 非破坏性：未隔离的真实实例与真正隔离的预览/测试行为不变；仅修正"覆盖变量指向共享数据根"这一原本错误放行的情形。预览只读合并共享登记的能力不变。
- 不引入隐藏/临时登记分类或逐条自动回收；既有污染条目的清理单独谨慎处理。
