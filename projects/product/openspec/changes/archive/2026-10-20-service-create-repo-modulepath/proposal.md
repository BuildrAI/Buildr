# 提案：新增服务按已选代码库填写模块路径

## Why

服务（Service）登记模型是解耦的：`services/manifest.yml` 条目通过 `repositoryId` 引用代码库实例（Repository Instance）、以 `modulePath` 定位库内模块（可空表示整个代码库）。但「新增服务」抽屉把「服务目录」当成唯一入口并强制 `directoryMode`，只接受 `projects/*/services/*` 下的目录；用户选择已有独立代码库时与服务目录组合产生必然失败的声明（`service_directory_outside_repository`），"服务 = 登记条目 + 关联代码库"这条模型本就支持的路径在网页上无法完成。本次只修正表单语义与可达性，不改登记模型。

## What Changes

- 服务新增抽屉的「代码库」选择成为代码位置的决定输入：选择已有代码库后，目录区替换为该库内的模块路径（`modulePath`）输入，可空、空值表示整个代码库即服务，提交不再携带 `directoryMode`。
- 在抽屉内内联新增代码库时，新库默认承载整个服务（`modulePath` 为空），不再与工作空间目录组合。
- 代码库留空时保持现有行为：选择 `projects/*/services/*` 下未登记目录或在项目下新建服务目录，由系统识别所属代码库并换算 `modulePath`。
- 后端登记语义、校验不变量与 HTTP 契约不变；本变更为前端交互语义修订，不破坏已保存数据与既有创建路径。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `workspace-asset-management-interactions`: 修订「服务新增直接选择服务目录」要求——服务目录不再是唯一入口；按是否选择已有代码库分化为"库内模块路径"与"工作空间服务目录"两种代码位置表达。

## Impact

- 代码：`projects/product/services/buildr-web/` 中 `ServiceCreateDrawer` 及相关选择/字段组件；`projects/product/services/buildr/` 后端与 HTTP 契约预期不变。
- API：`POST /api/v1/asset-catalog/services` 的请求组合（不带 `directoryMode` 的 `repositoryId` + `modulePath`）已支持，无破坏性变更。
- 用户：选择已有独立代码库创建服务从必然报错变为可用；留空代码库路径行为不变。
