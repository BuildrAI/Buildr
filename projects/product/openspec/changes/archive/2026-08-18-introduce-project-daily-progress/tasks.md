## 1. 本机文件权威与忽略规则

- [x] 1.1 定义 Daily Progress closed schema、路径 `.buildr/daily-progress/<project-code>/<YYYY-MM-DD>.yml` 与原子覆盖写入
- [x] 1.2 让 `init`/`sync`/`update` 幂等写入 `/.buildr/daily-progress/` ignore，并覆盖旧 Workspace 补齐
- [x] 1.3 增加路径、未登记 Project、非法日期、覆盖重跑与 ignore 的单测

## 2. Task n:n 关联与 Application

- [x] 2.1 实现 Daily Progress Application：校验 1..N 已存在 Task ID、去重、拒绝空关联，不写 Task Record
- [x] 2.2 提供 inspect/list 与按人/按 Task 投影；读取时未解析 Task 标为 unresolved
- [x] 2.3 增加 n:n、缺失 Task fail closed、未解析反查的测试

## 3. CLI、Skill 与同步门禁

- [x] 3.1 登记 agent-machine CLI `record`/`inspect`/`list` 与公开 JSON schema
- [x] 3.2 新增产品 Skill：先走「更新 workspace」同步，失败不 record；说明定时器属于 Agent 宿主
- [x] 3.3 增加 CLI contract 测试与 Skill/package 静态校验

## 4. Web 只读展示

- [x] 4.1 增加 Project/Task 只读 HTTP endpoint，不接受路径、不写入
- [x] 4.2 项目详情增加每日演进视图（按日/人/任务）与空态；Task 详情展示反向关联
- [x] 4.3 增加 Web/API 测试与生产托管页面冒烟钩子

## 5. 当前认知与直接验证

- [x] 5.1 更新 glossary、overview/product/technical architecture 与 Buildr/Buildr Web Service 说明
- [x] 5.2 运行 OpenSpec strict validation 与受影响 Buildr/Buildr Web 测试
- [x] 5.3 执行 current knowledge reconcile，确认 Brief、specs、实现和 impact evidence 一致
