## 1. 规划与当前认知

- [x] 1.1 生成Brief并完成current knowledge与术语影响评估，记录`.buildr/knowledge-impact.yml`
- [x] 1.2 通过OpenSpec strict validation与convergence preflight，确认没有active Change冲突或Scenario遗漏

## 2. Parent Coordination v3

- [x] 2.1 将Application与公开JSON registry升级到v3，删除Plan、work item、readiness与next action重复字段
- [x] 2.2 将Planning Review和Child Contribution Handoff投影为协调摘要，并保持四种mode与三个状态轴语义
- [x] 2.3 同步CLI成功/blocked envelope、HTTP worker与全部Parent coordination action

## 3. 消费者与交付资产

- [x] 3.1 更新Buildr Web TypeScript类型和Parent/Child组件，只消费v3 canonical字段
- [x] 3.2 更新随包Agent Skills、CLI/JSON文档与current knowledge，移除v2字段指引
- [x] 3.3 构建并同步正式`web-dist`，证明其来自current buildr-web源码

## 4. 验证反馈与收敛准备

- [x] 4.1 更新Application、CLI、HTTP、contract、system与Web测试，覆盖v3 identity和已删除字段
- [x] 4.2 为两个大型Parent fixture增加不超过25 KiB且至少减少50%的响应体积回归
- [x] 4.3 运行focused与affected测试、OpenSpec strict validation和package parity，处理全部直接反馈并准备convergence
