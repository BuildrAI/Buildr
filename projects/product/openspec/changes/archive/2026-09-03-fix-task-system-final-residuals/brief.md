# 修正任务系统最终残留

## 一句话摘要

让 Buildr 当前任务规范、实现、Web、CLI 与严格 TypeScript 边界最终一致，并关闭 Verification 并发覆盖和历史引用读取扩散。

## 背景与问题

主要任务模块已经退役或拆分，但 current specs/knowledge 仍正向描述旧能力；Verification current 无调用方摘要保护；Task Record CLI 会因旧外部引用不可用而整条失败；Web 首屏默认加载全部历史任务；帮助和任务核心类型边界仍有漂移。

## 目标与非目标

目标是清理当前契约、增加 Verification 原子并发保护、隔离 Task Record 引用诊断、修正 Web/CLI，并使 `src/task` 保留能力通过严格 TypeScript。非目标是恢复旧流程、建立聚合状态、修改发布/Candidate、重构全部 Skills 或删除历史 migration/数据。

## 受影响角色

- Agent：依据准确 Skill/help/spec inspect 后写 Verification 报告，冲突时重新读取再判断。
- Buildr Web 用户：首次只看未结束任务，可通过复盘筛选查看终态任务。
- Buildr 维护者：当前 Task 源码、DTO、测试 ownership 和文档使用真实 `.ts` 路径与类型。

## 核心流程

1. Agent inspect Verification 槽位并取得 `absent|reportDigest`。
2. Agent 直接执行项目测试，record 时提交观察摘要；Repository 事务内比较并原子替换。
3. Task inspect/list 先返回 SQLite 顶层事实，再附加每个外部引用的局部 availability diagnostic。
4. Web 默认请求 `status=open`；用户选择复盘两态时切换为 `all`。

## 关键变化

- Verification `record` 增加 `expectedReportDigest` / `--expected-report`。
- Task Record 响应增加 `referenceDiagnostics`，持久化 v3 不变。
- Web 默认状态由 `all` 改为 `open`，后端兼容语义不变。
- CLI help 与六个 Task Record action、终态更正和副作用边界一致。
- 当前规范和文档删除旧系统正向要求；Task 核心严格 TypeScript。

## 影响、风险与兼容性

旧 Verification record 调用未携带摘要时将被明确拒绝；这是防止静默覆盖的有意收紧。Task/Review/Verification 持久化 schema 不升级，不删除数据。Task Record/Verification JSON 只增加响应信息或新 conflict detail；后端 list 省略 status 仍为 all。

## 验收摘要

并发 Verification 第二写失败且不覆盖；外部引用失效时 CLI/Web 仍读到同一 Task；新增不存在引用拒绝；Web 首屏 open、复盘终态和请求竞态通过；帮助准确；`src/task` 无 `@ts-nocheck`；fresh/upgrade、DTO、OpenSpec、changed/package、Browser 与 Doctor 通过。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Tasks](tasks.md)
- [Delta Specs](specs/)
