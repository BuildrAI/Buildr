## 1. 额度解析

- [x] 1.1 在 `services/buildr-agent/src/model-access/providers/qoder.ts` 的 `observeQoderQuota` 中解析 `dedicatedResourcePackages`，按设计生成 `dedicated:<id>` 窗口（名称、比例、credits、到期时间），且不加入账号级聚合；验证方式：新增单元测试观察到专属窗口，既有 `credits`、`add-on`、`org-package` 断言不变。
- [x] 1.2 为 `services/buildr-agent/test/unit/model-providers.test.ts` 增加专属包用例，覆盖名称优先顺序、`available` 不为 `true` 时忽略、缺失 `id` 时索引标识、数量缺失时不推算；验证方式：`node --test` 运行该测试文件通过。

## 2. 当前认知

- [x] 2.1 更新 `knowledge/docs/architecture/agent-integration.md` 的“模型额度与使用偏好”段落，说明 `dedicatedResourcePackages` 的独立窗口表达与不纳入账号级聚合的边界；验证方式：文档内容与规范条目及实现一致。
- [x] 2.2 同步 `.buildr/knowledge-impact.yml` 的本任务影响项；验证方式：文件中的 `task`、`change` 与 `sourceIdentities` 指向本次真实材料。

## 3. 验证

- [x] 3.1 在 `services/buildr-agent` 运行本次受影响的静态检查与单元测试；验证方式：命令通过，且额度相关既有用例无回归。
