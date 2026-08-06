## 1. Terminal association model

- [x] 1.1 扩展 Task lifecycle current read model，保存和校验最小 terminal association snapshot。
- [x] 1.2 为 terminal association 的正常、缺失和非法输入补充 Unit/Integration 测试。

## 2. Finish writer and terminal reader

- [x] 2.1 在 Task Finish durable completion 路径投影 current handoff、Candidate 与三个 gate 的交付关联，并使失败显式阻止成功结果。
- [x] 2.2 将 terminal delivery projection 改为消费保存的 association，不再用当前 Review/Verification Result 重新匹配。
- [x] 2.3 增加已交付、旧数据缺失和 GET 不重新匹配当前专业 Result 的回归测试。

## 3. Knowledge and direct validation

- [x] 3.1 更新 Change Brief 与受影响的 Buildr current knowledge，保持专业 authority 和 Local App 读取边界一致。
- [x] 3.2 运行 OpenSpec strict validation、受影响测试和 changed-plan 反馈，记录调用次数与行为证据。
