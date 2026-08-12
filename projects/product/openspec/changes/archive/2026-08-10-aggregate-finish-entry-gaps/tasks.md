## 1. 入口聚合观察

- [x] 1.1 抽取 Task Finish run 创建前的 entry readiness 观察：复用 Environment / Development / target / remote 既有检查，非短路收集 findings
- [x] 1.2 将 findings 固定映射到 `development` | `environment` | `delivery`，有缺口时抛出/返回 `task_finish.entry_gaps` 且不创建 run / execution record
- [x] 1.3 有 `development` 缺口时设置 nextWorkflow/`suggestions` 为 `task-development`

## 2. CLI 与 Skill

- [x] 2.1 `reportCliFailure` 在 `--json` 时透传 `error.details`（含 `gaps`）
- [x] 2.2 更新 `task-finish` Skill「调用前」为消费产品聚合分类结果；同步 package 目标副本所需源资产

## 3. 测试与验证反馈

- [x] 3.1 增加多入口缺口负例：同时构造环境+研发（或研发+交付）缺口，断言一次返回两类 gaps 且无 Finish run
- [x] 3.2 增加仅交付缺口负例：断言只落在 `delivery`，不误标为 development
- [x] 3.3 运行受影响 Task Finish / CLI 测试并修回归

## 4. 当前认知与 Change disposition readiness

- [x] 4.1 编写并维护 Change `brief.md` 与 `.buildr/knowledge-impact.yml`（assess）
- [x] 4.2 `openspec validate aggregate-finish-entry-gaps --strict` 通过
