## 1. SQLite read model

- [x] 1.1 新增连续 migration，建立 `task_lifecycle_current` 及 JSON 校验约束。
- [x] 1.2 新增 read-model repository，提供单 Task 读取、read-modify-write、digest 和结构校验。
- [x] 1.3 新增 lifecycle read-model Application，保持 projection 不是专业 authority，并支持缺失 snapshot 的稳定诊断。

## 2. Lifecycle writers

- [x] 2.1 在 Task Record create/update/complete/abandon 写入后投影 Task status。
- [x] 2.2 在 Task Development 成功 transition 后投影 Receipt digest、applicability、gates、decision 和 handoff 摘要。
- [x] 2.3 在 Review、Verification 成功 record 后投影 slot digest、target、conclusion 和保存时 applicability。
- [x] 2.4 在 Environment prepare/cleanup/resource lifecycle 后投影状态、observedAt、资源/清理摘要。
- [x] 2.5 在 Finish 完成后投影 terminal delivery summary；noChange 和 abandoned 终态也要有明确投影。

## 3. Pure read paths

- [x] 3.1 将 Development inspect 改为 SQLite current record + persisted applicability 查询，移除 GET 路径实时 observe。
- [x] 3.2 将 Review/Verification inspect 改为只读取专业 current record 与 persisted applicability。
- [x] 3.3 将 Terminal Delivery inspect 改为读取已保存 lifecycle summary，不扫描 Finish Result、Git 或 Environment。
- [x] 3.4 确认 Local App HTTP/Web 只调用 Application read model，并保持 no-store 与安全边界。

## 4. Tests and validation

- [x] 4.1 增加 migration/repository/Application projection 写入和替换测试。
- [x] 4.2 增加 lifecycle GET 不调用 Git、Content Target、declaration、Environment probe、Finish scan 的 contract/system 测试。
- [x] 4.3 验证旧数据缺失 snapshot 返回 unknown 且 GET 不回填。
- [x] 4.4 运行受影响测试、Buildr Doctor 和 Local App 研发/证据读取性能复测。
