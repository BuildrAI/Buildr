## 1. 契约与基线

- [x] 1.1 确认 OpenSpec proposal/design/specs 覆盖选择、默认选中、空态与异步竞态约束
- [x] 1.2 为 change 建立 contract baseline 并运行 proposal stage check

## 2. 创建变更表单

- [x] 2.1 保持所属项目为已登记 Project 下拉，上下文有效时默认选中，无项目时展示空态
- [x] 2.2 在 await 前捕获本次 form/select/errorBox 并先 bindForm；响应返回后仅在仍连接且仍是当前表单时填充或展示错误

## 3. 验证

- [x] 3.1 补充浏览器集成：项目列表延迟返回期间切换到其他表单后，过期响应不得污染当前表单
- [x] 3.2 无已登记 Project 时展示空态且无法生成创建变更 prompt
- [x] 3.3 运行 `npm run test:browser:change` 与受影响验证并确认通过
