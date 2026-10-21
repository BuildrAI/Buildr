## 1. 实现

- [x] 1.1 将 `AssetEditDrawer` 中服务编辑的“所属项目”改为多选，初始化展示全部归属并按全量 `projectIds` 提交；验证 `npm run build` 通过。
- [x] 1.2 保持新增服务抽屉的所属项目单选，以及项目/代码库关系控件不变；验证现有 `npm test` 通过。

## 2. 测试

- [x] 2.1 为 `assetEditDraft` 增加多项目归属读取测试，验证返回全部项目标识；运行 `npm test` 通过。
- [x] 2.2 核对服务编辑保存路径按全量 `projectIds` 提交，并复用后端 `asset-relationships.test.ts` 已覆盖的全量语义；记录核对依据。
- [x] 2.3 在浏览器中打开一个共享服务的编辑抽屉，验证全部项目可见、增删并保存后各项目引用正确。

## 3. 规格、知识与核对

- [x] 3.1 运行 `openspec validate service-edit-project-multiselect --strict`，确认规格增量通过。
- [x] 3.2 核对 `knowledge/code-map/project-service-repositories.md` 与关系图：服务新增仍为单选，关系图不表达编辑控件，本次无需改写；把结论和来源写入 `.buildr/knowledge-impact.yml`。
- [x] 3.3 核对服务列表与主页：二者已通过 `projects` / `related` 展示全部关联项目，本次无需额外修正；记录核对依据。
