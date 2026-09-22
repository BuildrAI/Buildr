## Why

项目菜单与标签职责重复，项目和服务缺少注销入口；服务目录被当作代码库，列表同步检查全部 Git 状态导致集鲜等待约三秒。

## What Changes

- 项目菜单固定返回目录，已有项目由标签定位。
- 项目和服务支持版本保护的删除登记，解除相关引用，保留文件、代码与历史任务。
- 代码库统一声明真实 Git 根目录，支持工作空间根、内部自定义位置及外部附接；显式归并旧 workspace 来源并调整模块引用。
- 服务与代码库提供独立轻量列表接口（API）；完整关系接口保留，Git 状态按单个代码库读取。
- 兼容旧声明读取；显式迁移改变代码库引用，不修改服务身份，不搬迁代码。无破坏性文件删除。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `workspace-asset-relationships`: 对象删除与轻量独立查询。
- `repository-instance-registry`: 真实仓库根登记与旧目录归并。
- `workspace-asset-management-interactions`: 项目菜单固定目录与删除入口。

## Impact

影响工作空间（Workspace）应用层、声明解析、命令行（CLI）、HTTP 契约、Buildr Web 页面及直接测试；更新现有关系说明，不新增依赖或运行入口。
