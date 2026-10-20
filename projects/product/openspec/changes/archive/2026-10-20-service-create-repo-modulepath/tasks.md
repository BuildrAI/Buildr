## 1. 表单结构调整

- [x] 1.1 在 `ServiceCreateDrawer` 中把「代码库（可选）」字段提到目录区之前，或保证其选择驱动后续区域渲染；已选已有代码库（`draft.repositoryId` 非空且非内联草稿）时隐藏「服务目录」「所在项目」及「将新建」提示，渲染模块路径（`modulePath`）输入，留空表示整个代码库即服务；验证：打开抽屉选择已有代码库后目录区消失并出现模块路径输入。
- [x] 1.2 内联新增代码库（`newRepository` 为真）时不渲染模块路径输入，新库默认承载整个服务（`modulePath` 为空）；验证：点击新增代码库展开 `RepositoryFields`，模块路径输入不出现。
- [x] 1.3 代码库留空时维持现有「服务目录」选择、「所在项目」与「将新建」提示行为；验证：清空代码库选择后目录区恢复，行为与现状一致。

## 2. 提交语义

- [x] 2.1 已选已有代码库时提交 `repositoryId` + `modulePath`（trim 后可空），从 draft 中去除 `directoryMode`、`directoryPath`、`directoryObservation`、`projectCode` 的目录语义；内联新增代码库时不携带 `modulePath`；验证：提交负载不含 `directoryMode`，后端不再返回 `service_directory_outside_repository`。
- [x] 2.2 已有代码库已选时跳过「所在项目」必填校验（不再有项目目录新建语义）；项目关联维持原入口（projectId 由调用方提供，例如项目组成内新建）；验证：仅选代码库不选项目可提交成功。

## 3. 验证与影响

- [x] 3.1 `cd projects/product/services/buildr-web && npx tsc --noEmit`（或既有构建脚本）通过，无类型错误；验证：命令退出码为 0。
- [x] 3.2 受影响知识成果核对：`knowledge/code-map/project-service-repositories.md`、`knowledge/docs/glossary.md`、`knowledge/docs/architecture/buildr-data-design.md` 描述的是登记模型（repositoryId + modulePath），不受表单交互修订影响，确认为 aligned；维护 `.buildr/knowledge-impact.yml` 本条变更记录；验证：影响文件含本条 `operation: assess` 记录。
- [x] 3.3 `openspec validate service-create-repo-modulepath --strict` 与 `projects/product/buildr openspec convergence preflight` 通过；验证：两条命令退出码为 0。
