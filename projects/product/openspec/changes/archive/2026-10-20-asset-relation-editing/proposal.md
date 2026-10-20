# asset-relation-editing

## Why

目录关系编辑不完整，用户无法从代码库侧管理服务引用，也不能在编辑时维护服务的稳定编码与项目归属：

- 新增服务时若选择已有代码库或内联新增代码库，提交负载丢弃 `projectCode`，所选项目不会生效，服务落到「尚未关联」。
- 服务编辑抽屉没有服务编码与所属项目字段；编码只能在创建时填写，项目归属只能在项目页维护。
- 新增/编辑代码库没有「引用服务」入口，只能逐个打开服务修改代码库引用。
- 项目列表的编辑入口仍走旧 project API，只能修改名称与说明，缺少项目编码与关联服务维护。
- 「新增项目」「新增代码库」抽屉的提交按钮靠左，与其他抽屉的取消＋右对齐主按钮不一致。
- 从项目关联服务中新增服务时，上一级项目没有默认且固定展示。

## What Changes

- **HTTP 契约（向后兼容新增可选字段）**：服务创建草稿接受 `projectIds`；代码库创建与统一更新接受 `serviceIds`；服务统一更新接受 `code` 与 `projectIds`；项目统一更新接受 `code`、`serviceIds` 与 `newServices`（新增服务草稿）。
- **目录写入语义**：代码库维护 `serviceIds` 表示把所选服务移入该代码库；已引用本库的服务必须保持在提交集合内，系统不得在此动作中移除引用（移出须先将服务登记到其他代码库）。服务 `projectIds` 与项目 `serviceIds` 为全量语义，按当前版本原子应用并维持历史定位。服务与项目编码可修改，重名拒绝；项目改码重写历史定位前缀，服务改码尽量随行 `services/<旧编码>/` 文档目录。
- **界面**：服务新增/编辑中的「所属项目」为单选且不带新增入口；新建服务目录时，该单选同时决定目录所在项目，避免重复选择；从项目入口进入时固定展示上一级项目。服务表单中的代码库为单选并带新增入口。代码库新增/编辑中的「所属服务」为多选且不带新增入口，编辑时当前成员锁定。项目创建/编辑中的「关联服务」为多选并带新增服务入口，项目编辑里的服务草稿与项目更新同事务保存。项目列表与主页编辑统一使用目录编辑抽屉，包含项目编码与关联服务；新增项目、新增代码库抽屉底部改为取消＋右对齐主按钮。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `workspace-asset-relationships`: 代码库维护可直接安置服务引用；服务与项目的编码、项目归属经统一更新可编辑，编码唯一性与历史定位保持不变量。
- `workspace-asset-management-interactions`: 服务新增项目归属固定展示或单选，目录新建时单选同时决定位置；服务代码库为单选且可新增；代码库所属服务为多选不可新增；项目关联服务为多选且可新增；项目编辑使用统一抽屉；抽屉按钮位置统一。
- `workspace-http-contracts`: 目录写入操作接受 `projectIds`/`serviceIds`/`code` 可选字段，未知字段与不存在引用继续按契约拒绝。

## Impact

- 实现：`services/buildr` 的 `workspace-http-contracts.ts`、`asset-relationships-application.ts`、`asset-catalog.ts` CLI 帮助；`services/buildr-web` 的 `ServiceCreateDrawer`、`AssetEditDrawer`、`RepositoriesPage`、`ProjectsPage`、`ProjectDetailPage`、`service-create-draft`、`asset-edit-draft`。
- 兼容：新字段全部可选，既有调用方行为不变；移除的 `ProjectEditDrawer`/`ServiceEditDrawer` 仅为前端内部组件。
- 测试：目录关系集成测试、HTTP 契约测试、项目编辑内联新增服务与前端草稿/浏览器交互测试扩展。
