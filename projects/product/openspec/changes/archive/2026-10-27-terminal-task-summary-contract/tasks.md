## 1. 工作台任务行摘要选择

- [x] 1.1 在 `buildr-web` 工作台任务行实现按状态选择摘要来源的纯函数：进行中取工作摘要最近进展，终态取任务结果摘要，两者都缺失时取任务目标；核对该函数不引入新接口字段（前端 typecheck 通过）
- [x] 1.2 让 `WorkbenchTaskRow` 使用该纯函数并保持任务标题、状态标识、范围与更新时间展示不变；核验进行中任务行仍显示工作摘要进展
- [x] 1.3 补充 `buildr-web` 测试覆盖终态任务行显示结果摘要、进行中任务行显示工作摘要、两者都缺失时退回任务目标；核验测试目标通过

## 2. 工作摘要终态写入契约

- [x] 2.1 修正 `buildr task work-context` 命令帮助文本，说明终态任务仍可补写进展、下一步与当前节点，检查适用性结论在终态后不可再修改；核验帮助文本不再宣称终态整体不可修改
- [x] 2.2 在 `buildr` 侧补充或更新工作摘要集成测试，断言终态任务可补写 progress/nextStep/stage 且既有内容保留，写入 checks 被拒且既有摘要不变；核验测试目标通过

## 3. 当前知识与文档校准

- [x] 3.1 核对 `projects/product/knowledge` 中工作台与工作摘要相关说明是否受本次语义变化影响，只在确有失真时校准，并在本变更中记录实际校准范围
  - 实际校准范围：仅 `knowledge/code-map/task-system.md` 的 `features/workbench/` 条目新增 `taskSummary.ts` 一行，说明按状态选择摘要来源的职责。
  - 未校准项：`knowledge/docs/glossary.md` 与 `knowledge/docs/architecture/task-system.md` 中关于工作摘要的定义与边界在本次语义下仍成立，未发现失真，保持原样。
  - 需另行确认的既有差异（不在本变更范围）：`openspec/specs/daily-workbench/spec.md` 要求"详情优先呈现目标/进展/下一步/成果"，实测任务详情页只呈现任务目标与"任务收尾"节点下的交付结果，未呈现工作摘要的最近进展与下一步。按规范与实现冲突须分别展示依据的约定，本变更不改写该承诺，交由后续决定。

## 4. 直接验证

- [x] 4.1 运行 `buildr` 与 `buildr-web` 受影响的静态检查与单元测试，确认全部通过
- [x] 4.2 运行 `openspec validate terminal-task-summary-contract --strict` 与 `buildr openspec convergence preflight`，确认通过
- [x] 4.3 在浏览器实测工作台任务列表：终态任务行显示结果摘要、进行中任务行显示工作摘要最近进展、任务详情页呈现不变
