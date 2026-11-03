## 1. 实施与验证
- [x] 1.1 统一添加身份字段并覆盖所有事件类型
- [x] 1.2 核对架构解释并执行单元、本地 HTTP 和类型检查
- [x] 1.3 向既有接收端发送一次带测试标记的事件，区分接收端接受与例行任务处理证据

真实接收端验证：测试标识 `agent-identity-test-068775c4-8fce-4465-b8ff-dc488e464f61`，事件标识 `39184dbdc26f22ca0a0e16c59446c3174f5bc49827203f365f45fb8f7d6b1017`。HTTP 400，未接受，例行任务处理未确认；未原样重试。

用户提供的接收端诊断：`{"success":false,"error":"Automation run rate limit exceeded: grok bot automation limit 200 per hour, current_count=201"}`。此为限流拒绝而非格式拒绝；用户另以不同的最小请求体复现。原测试请求实际已执行，接收端接受／例行任务处理仍待窗口恢复后复测。后续测试应保留经秘密替换、有界的响应正文。
