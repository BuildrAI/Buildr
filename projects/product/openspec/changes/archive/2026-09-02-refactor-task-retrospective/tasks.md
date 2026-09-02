## 1. Task Record与本机文档

- [x] 1.1 将Task Record升级为新的closed版本，删除复盘来源并增加可空文档摘要与`pending-decision|decided`状态
- [x] 1.2 实现固定`.buildr/local/task-retrospectives/<task-id>.md`路径解析、文件安全读取、摘要漂移和Task Record受控更新
- [x] 1.3 更新Task CLI、HTTP、公开JSON、生成DTO与查询过滤，退役旧来源参数和`hasRetrospective`

## 2. 旧模块与数据退役

- [x] 2.1 删除Retrospective Domain、Application、Repository、内部Driver、HTTP处置接口、模块端口和内部route诊断
- [x] 2.2 新增连续SQLite migration，删除旧正文、三态处置和来源关系且不保留legacy或双读
- [x] 2.3 退役独立capability contract、binding、public result和package静态要求，保留纯`task-retrospective` Skill

## 3. Buildr Web与Agent使用方式

- [x] 3.1 删除独立复盘Tab和旧处置交互，在Task概览展示本机文档、摘要漂移与决定状态
- [x] 3.2 更新Task列表为`missing|pending-decision|decided`过滤，查看文档保持零写入
- [x] 3.3 重写Task Retrospective、Task Manager及受影响consumer guidance，删除自动提示、批量处理和专用后续关系

## 4. TypeScript与测试

- [x] 4.1 删除确定退役的JavaScript及专属测试，把本Change保留且修改的实现、测试、fixture、helper和接口迁入严格TypeScript并清除相关`@ts-nocheck`、`any`和掩盖边界的断言
- [x] 4.2 补齐Task Record domain、SQLite、Application、CLI、HTTP、文件漂移、旧库升级、新库初始化和失败恢复的最低充分测试
- [x] 4.3 更新Buildr Web组件、API和Browser测试，证明无文档、待决定、已决定、只读查看、文件变化和其他Task功能独立
- [x] 4.4 更新verification registry、ownership、package parity与retired-residual检查，删除旧Retrospective primary owner

## 5. 当前认知与变更验证

- [x] 5.1 收敛Brief、产品/技术架构、Buildr与Buildr Web Service说明和术语，记录Current Knowledge reconcile结果
- [x] 5.2 运行OpenSpec strict与convergence preflight，修复active Change冲突或语义遗漏
- [x] 5.3 运行focused测试、完整低成本回归、功能测试和适用Browser验证并记录实际结果
