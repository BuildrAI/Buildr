## 1. Runtime profile 注入

- [x] 1.1 在 Buildr Web 生产入口页注入 Runtime 已解析的 closed Web profile，并保持旧入口缺失值兼容
- [x] 1.2 增加 released/development 两种 Runtime 入口注入测试，证明正式版不被误标

## 2. 应用壳开发版标识

- [x] 2.1 在应用壳解析 closed Web profile，仅为 `development` 渲染稳定的“开发版”标识，并把浏览器标签页产品名显示为 `Buildr Web Dev`
- [x] 2.2 增加紧凑、响应式样式及前端契约/浏览器断言，并重新构建正式 `web-dist`

## 3. 当前认知与直接验证

- [x] 3.1 更新 Buildr Service 当前认知，记录 Runtime profile 注入与开发版标识边界
- [x] 3.2 运行前端构建、focused Runtime/contract 测试、web-dist 与浏览器验证，并完成严格 OpenSpec 校验和 archive readiness 检查
