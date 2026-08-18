## 1. Schema 与 Application

- [x] 1.1 将每日演进 closed schema 升为 `buildr.project-daily-progress/v2`：必填日摘要 `added`/`updated`/`deleted`/`drawbacks`、commits、files；`taskIds` 允许空数组
- [x] 1.2 Application 校验 `authorship`：`other` 禁止非空 Task；存在的 Task ID 仍须本机存在，否则整次 fail closed
- [x] 1.3 inspect 将 v1 文件标为 incompatible/不可展示；GET 仍不扫描 Git、不读 `user.email`
- [x] 1.4 更新 domain/application 单测与集成测试：空 Task、他人带 Task 拒绝、v1 读取、覆盖重跑

## 2. CLI 与 Skill

- [x] 2.1 扩展 record payload 与 JSON identity，报告提交计数与可为 0 的 Task 关联计数
- [x] 2.2 更新产品 Skill：同步成功后收集当日 commits/files，对比 `git config user.email`，由 Agent 总结四问并判断自己的提交是否挂 Task
- [x] 2.3 更新 CLI 帮助、contract 测试与 Skill 静态校验

## 3. Web 只读展示

- [x] 3.1 HTTP inspect/task-view 返回日摘要、提交、变更文件与可选 Task；他人提交无 Task 芯片
- [x] 3.2 项目详情按日展示四问、提交、文件；按人按作者分组；按任务只聚合已关联的自己的提交
- [x] 3.3 空态说明需 Agent 收集 Git 后写入，不根据 Git 自动填充；DatePicker 与 `#progress-body` 无写入控件保持不变
- [x] 3.4 Task 详情只反向展示已关联该 Task 的条目；更新 browser smoke

## 4. 当前认知与直接验证

- [x] 4.1 更新 glossary、overview、产品/技术架构、每日演进流程与 Buildr/Buildr Web Service 说明
- [x] 4.2 运行 OpenSpec strict validation 与受影响 Buildr/Buildr Web 测试
- [x] 4.3 执行 current knowledge reconcile，确认 Brief、specs、实现和 impact evidence 一致
