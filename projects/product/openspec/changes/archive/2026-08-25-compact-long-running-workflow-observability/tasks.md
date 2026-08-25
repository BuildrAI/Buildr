## 1. 公共紧凑投影

- [x] 1.1 实现并登记 `buildr.long-running-operation-summary/v1` closed schema、projection helper 与固定 UTF-8 字节上限
- [x] 1.2 为 status、identity、primary failure、cleanup、output boundary、recovery pointer及禁止字段补单元/契约测试

## 2. 专业 owner 接入

- [x] 2.1 让 Task Retrospective list 同时受数量与总字节预算约束，并保证只在完整 item 边界截断
- [x] 2.2 让 formal Verification 缺省输出 compact、显式 `--detail full` 保留 canonical payload，并从 Execution Record生成防重跑/恢复指针
- [x] 2.3 让 release transaction dispatch/readiness/inspect-run 缺省输出 compact、显式 full读取同一 output或hosted evidence
- [x] 2.4 让 self-bootstrap runner缺省输出 compact、显式 full保留canonical Result，并把可识别的passed/blocked终态刷新到既有Finish maintenance

## 3. Agent 使用与公共契约

- [x] 3.1 更新受影响的 bundled Skills/help，使 Agent 默认先消费 compact并按唯一pointer inspect，禁止因stdout丢失重复唯一runner或昂贵验证
- [x] 3.2 更新公共 JSON registry、schema coverage、checkout/npm parity与self-bootstrap Component integrity

## 4. 当前认知与验证反馈

- [x] 4.1 更新 Buildr Service current knowledge与glossary，说明紧凑终端摘要只读投影、专业authority和恢复边界
- [x] 4.2 补齐成功、失败、running、超大输出、展示截断、断连后回读、字节边界和禁止重复执行的component/integration/system测试
- [x] 4.3 运行focused/affected验证、OpenSpec strict/preflight并修复全部当前Change问题
