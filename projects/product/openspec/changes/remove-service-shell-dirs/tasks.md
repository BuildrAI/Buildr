## 1. 实现

- [x] 1.1 修改 `services/buildr/src/modules/workspace/application/asset-relationships-application.ts` 的 `mutate()`：`roots` 不再包含"无 `directories` 条目的新服务的 `services/<code>`"，并移除对应的模板 `AGENTS.md` 写入循环；`directoryMode: 'create'` 的条目改为 `ensureDirectory` 只建目录、不写 `AGENTS.md`。验证：`createCatalogService`（无目录模式）后 `services/<code>` 不存在；`directoryMode: 'create'` 后目录存在且无 `AGENTS.md`；清单照常写入。

## 2. 测试

- [x] 2.1 更新 `test/integration/asset-relationships.test.ts`：去除/反转对 `services/<code>/AGENTS.md` 存在的断言（约 154、267、386、779 行一带），对缺失文档断言 `exists === false`；`directoryMode: 'create'` 断言目录存在且无 `AGENTS.md`；删除服务的物理保留断言改用自建文件。验证：`npm run test -- test/integration/asset-relationships.test.ts`（或服务既有测试入口）通过。
- [x] 2.2 全量运行服务测试套件确认无其他依赖空壳目录的断言。验证：服务级测试命令全部通过。

## 3. 当前认知与文档

- [x] 3.1 核对 `projects/product/AGENTS.md` 资产边界表、README、CLI 参考文档中"服务资产 `services/<service>/` 是实现位置"的表述是否仍准确；表述过强处更新为"服务文档与规则的可选根，代码位置以代码库实例定位"。验证：相关文档不再声称每个服务自动拥有 `services/<code>` 目录。
- [x] 3.2 知识影响评估：`knowledge/` 下代码地图与技术图未记录空壳投射行为，结论 `not-applicable`；若实现中发现新增受影响知识成果，按 `buildr.current-knowledge-maintenance/v4` 维护。

## 4. 规范收敛

- [x] 4.1 `openspec validate remove-service-shell-dirs --strict` 与 `buildr openspec convergence preflight` 通过。验证：命令退出码为 0。
