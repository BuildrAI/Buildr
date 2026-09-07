## 1. 规范与认知收敛

- [x] 1.1 删除非归档 canonical specs 对 Task Overview、Environment、Development、Execution Record、旧 Finish 和内部 workflow router 的正向要求，并修正 Task `.ts` 路径
- [x] 1.2 更新 Buildr Service、技术架构、任务收尾、术语、CLI/架构文档及测试 ownership
- [x] 1.3 增加排除 archive、migration、legacy fixture 的当前规范残留静态检查

## 2. Task Verification 并发保护

- [x] 2.1 为 Domain/Application/Repository 建立严格类型和 `expectedReportDigest` 调用边界
- [x] 2.2 在同一 `BEGIN IMMEDIATE` 事务内实现 current 摘要比较、原子替换、写后回读和稳定冲突诊断
- [x] 2.3 更新 CLI help、公共 JSON、Skill、HTTP/DTO相关边界与 serialization/SQL/readback/commit/concurrency测试

## 3. Task Record 读取隔离

- [x] 3.1 为 inspect/list/detail 增加 Project、Service、Change 响应级 `referenceDiagnostics`
- [x] 3.2 让 create 只接受可用引用，update 只校验新增引用，并允许删除失效引用或修改无关字段
- [x] 3.3 更新 HTTP schema、生成 DTO、CLI/Web和单元/集成/System测试

## 4. Buildr Web 与 CLI

- [x] 4.1 任务列表默认/重置使用 open，复盘两态自动切 all，并保留请求代次和两种空状态
- [x] 4.2 增加默认 open、终态复盘、旧响应不覆盖和空状态浏览器验收，移除详情重复 DOM ID
- [x] 4.3 修正 Task/Verification command catalog 与 help 对 activate、终态更正和各动作副作用的说明

## 5. Task 核心 TypeScript 收敛

- [x] 5.1 删除 `src/task` 全部 `@ts-nocheck`，为 Review 与 Parent Coordination Domain/Application/Repository/CLI/HTTP 建立实际类型
- [x] 5.2 消除 Verification 公共接口、Application、Repository、事务上下文与 JSON 输入边界的 `any`
- [x] 5.3 收紧 `task/module.ts` ports，保持唯一 Domain/DTO与生成源

## 6. 验证与收敛

- [x] 6.1 运行 TypeScript typecheck、DTO generation check、Task Record/Review/Verification/Parent Coordination测试
- [x] 6.2 运行 SQLite fresh/upgrade、CLI help/compatibility、Buildr Web Browser和changed/package/static验证
- [x] 6.3 完成 Current Knowledge reconcile/inspect、术语检查、`openspec validate --all --strict`、convergence audit与`git diff --check`
