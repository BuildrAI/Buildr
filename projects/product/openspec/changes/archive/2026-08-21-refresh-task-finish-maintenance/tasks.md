# Tasks

- [x] 1.1 增加 Product-owned Finish maintenance reconciliation contract、identity 校验与 current/terminal writer。
- [x] 1.2 让 Finish inspect 与 Terminal Delivery 读取刷新后的 maintenance projection，并保持 Delivery 字段不变。
- [x] 1.3 让 self-bootstrap closeout passed 路径调用 maintenance reconciliation。
- [x] 1.4 让 Task Environment cleanup 在写入 cleaned receipt 后触发同一 reconciliation；刷新失败不得回滚 Environment authority。
- [x] 1.5 添加 passed、cleaned、乱序到达、foreign result 与 Delivery 不变的回归测试。
- [x] 1.6 运行受影响 Service 测试、契约检查与最终 Doctor/工作树检查。
