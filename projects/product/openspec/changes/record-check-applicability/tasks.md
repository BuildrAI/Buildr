# 1. 契约与写入面

- [x] 1.1 TaskWorkContext 契约扩展可选 `checks`（三项检查 × needed/not-applicable + 理由），CAS 校验不变；HTTP/CLI 提供任务 active 期间的记录入口，补 schema 与应用测试。
- [x] 1.2 服务端读取模型把 checks 随工作摘要返回；字段缺省时前端与既有消费方不受影响。

# 2. 呈现与指引

- [x] 2.1 任务详情方案审查、实现审查、开发验证目录项区分"未执行 / 不适用（理由）/ 已有结果"；理由可在对应内容区阅读。
- [x] 2.2 更新 task-triage、task-review、task-verification、task-finish 及 openspec 增强指引的适用性判断与留痕义务文案。
- [x] 2.3 类型检查、受影响逻辑测试与 buildr-web 构建通过。
