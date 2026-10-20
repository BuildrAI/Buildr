## Context

`asset-relationships-application.ts` 的 `mutate()` 在服务创建提交时统一物化目录：未显式选择代码目录的新服务获得 `services/<code>/AGENTS.md` 模板；`directoryMode: 'create'` 的项目内服务目录获得 `# <名称>` 单行 `AGENTS.md`。两类写入都是登记副作用，不承载真实规则。服务文档读取（`catalogServiceDocument`）与规则投射（`resolveRuleScope`）均按"目录实际存在"工作，不依赖该模板。

## Goals / Non-Goals

**Goals:**

- 服务登记与目录物化解耦：`services/manifest.yml` 是唯一登记事实，文件树只在用户显式选择或人工创建时出现服务目录。
- 保留文档与规则读取的既有优先级（`services/<code>` 优先、代码库模块目录兜底），兼容人工放置的服务级 `AGENTS.md`。
- 保留目录占用冲突、观察版本校验与事务回滚语义。

**Non-Goals:**

- 不清理既有工作空间已生成的 `services/<code>/` 目录。
- 不改变 `directoryMode` 的目录选择、代码库推导与 `modulePath` 计算。
- 不调整规则发现、投射或 `catalogServiceDocument` 的读取实现。

## Decisions

1. **未显式选择目录的服务不再进入物化清单**。`mutate()` 中 `newServices` 不再为无 `directories` 条目的服务生成 `services/<code>` 检查项与文件写入。这样移除的不是"预留挂载点"能力——`services/<code>` 仍可被人或未来的能力写入并被读取——而是"每个登记都制造空目录"的副作用。
2. **`directoryMode: 'create'` 改为只建目录**。由事务内 `ensureDirectory` 替代模板 `AGENTS.md` 写入；目录仍被登记为受管路径并参与占用冲突检查与快照回滚。替代方案"连目录都不建"会改变 `directoryMode: 'create'` 的目录承诺，影响面大于本次目标，不采纳。
3. **既有目录零迁移**。已有 `services/<code>/` 继续作为文档优先根被读取；不引入清理动作，符合"关系变更不隐式删除内容"的既有承诺。

## Risks / Trade-offs

- [测试或外部流程依赖模板 `AGENTS.md` 的存在性] → 集成测试断言同步更新；`catalogServiceDocument` 对缺失文档返回 `exists: false`，界面按既有"未找到"语义展示，不报错。
- [未来服务级规则缺少写入入口] → 目录约定不变；人可直接创建 `services/<code>/AGENTS.md`，需要规模化写入时再设计独立能力。
- [`services/` 根目录可能完全为空] → 目录本身是登记目录的容器，空容器不报错；不新增清理逻辑。

## Migration Plan

无数据迁移。实现与规范同次提交；既有工作空间目录原样保留，行为变化只作用于新建服务。
