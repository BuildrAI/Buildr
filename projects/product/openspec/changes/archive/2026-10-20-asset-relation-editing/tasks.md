# asset-relation-editing Tasks

## 1. 契约与应用层

- [x] 1.1 `workspace-http-contracts.ts`：`serviceDraft` 增加 `projectIds`；`assetRepositoryRequest` 增加 `serviceIds`；`assetUpdateRequest` 增加 `code`、`projectIds`、`serviceIds`、`newServices`。验证：生成的 DTO 与契约测试覆盖新字段及未知字段拒绝。
- [x] 1.2 `asset-relationships-application.ts`：`createCatalogService` 合并 `projectId`/`projectIds`/`projectCode` 推导的项目归属（解析编码、拒绝未知项目）；`createCatalogRepository` 接受 `serviceIds` 并把服务移入新库；`updateCatalogAsset` 处理 repository 的 `serviceIds`（当前成员必须保留，移入按实际集合更新 `repositoryId`）、service 的 `code`/`projectIds`（未知项目拒绝、全量差异应用）、project 的 `code`/`serviceIds`（重写 `legacyRefs` 前缀）；服务改码后尽力重命名 `services/<旧编码>/`。验证：相关集成测试通过。
- [x] 1.3 `asset-catalog.ts` CLI 帮助补充新字段说明。验证：帮助文本与实现一致。

## 2. 前端

- [x] 2.1 `service-create-draft.ts`：提交负载保留 `projectCode` 并携带 `projectIds`；草稿仍保留隐藏选择。验证：草稿单测更新通过。
- [x] 2.2 `ServiceCreateDrawer.tsx`：所有代码位置模式展示所属项目——有上一级项目时固定展示，否则提供单选且不带新增入口；新建服务目录时同一选择同时决定目录位置，不重复显示项目选择。验证：选择代码库时项目归属仍生效。
- [x] 2.3 `AssetEditDrawer.tsx`/`asset-edit-draft.ts`：服务编辑增加服务编码（必填）与所属项目单选；项目编辑增加项目编码（必填）与关联服务多选（复用 `ProjectServiceSelection`，含新增服务草稿 `newServices`）；代码库表单提供「所属服务」多选（不带新增入口），当前成员不可移除；模块目录说明改为库内相对路径语义。验证：编辑保存携带新字段。
- [x] 2.4 `RepositoriesPage.tsx`：新增代码库抽屉增加「所属服务」多选（不带新增入口）并把按钮改为取消＋右对齐主按钮。验证：创建携带 `serviceIds`。
- [x] 2.5 `ProjectCreateDrawer.tsx`：底部按钮统一为取消＋右对齐主按钮。
- [x] 2.6 `ProjectsPage.tsx`/`ProjectDetailPage.tsx`：编辑入口改用 `AssetEditDrawer`（kind=project），删除 `ProjectEditDrawer` 与未使用的 `ServiceEditDrawer`。验证：项目编辑覆盖编码与关联服务且无旧入口引用。

## 3. 测试与验证

- [x] 3.1 更新/新增集成测试 `test/integration/asset-relationships.test.ts` 及契约测试：覆盖 repository create/update `serviceIds`、service update `code`/`projectIds`、project update `code`/`serviceIds`、未知引用与移除当前成员拒绝。验证：服务测试入口通过。
- [x] 3.2 更新 `buildr-web` 草稿与相关单测；运行前端类型检查/构建。验证：`npm run build` 或服务既有验证入口通过。
- [x] 3.3 运行 `npm run contracts:generate:workspace` 重新生成 `workspace-http-dto` 并核对编译。验证：生成物与契约一致。

## 4. 规范收敛

- [x] 4.1 `openspec validate asset-relation-editing --strict` 通过。验证：命令退出码为 0。
