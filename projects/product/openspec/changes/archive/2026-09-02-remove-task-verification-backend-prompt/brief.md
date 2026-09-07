# 用户会得到什么

用户在Buildr Web点“交给智能体验证”时仍会得到清晰指令，Agent照Task Verification Skill和真实项目测试入口完成验证；后端不再维护一套重复提示词。

## 保留

- Project测试地图与Task验证报告。
- 报告对内容版本、声明版本的确定性比较。
- 前端Agent action和证据页只读展示。

## 删除

- `generateTaskVerificationPrompt`。
- `POST /prompts/task-verification`。
- 专属request/response schema、mapping、两端DTO与typed client方法。

没有数据迁移；没有统一流程状态或新增授权。
