# 开放任务执行记录读取与展示

## 一句话摘要

让用户在 Local App 的同一个 Task 中查看全部、Verification 与 Finish 多次执行记录，并安全读取已脱敏、受限的输出正文。

## 背景与问题

Verification 与 Finish 已经把正式执行的 metadata 和正文保存到统一 Task Execution Record authority，但目前没有公共只读接口或 Local App 展示。用户只能看到一个 Verification current Result 和 Finish current/terminal 摘要，无法从产品界面理解多次运行、失败、重试和相关输出。

## 目标

- 提供 Task-scoped 列表、详情和受限正文读取。
- 提供全部、Verification、Finish 三种筛选视图。
- 在统一执行记录浏览器之外，从 Verification 与 Finish 专业区块进入各自视图。
- 保持 portable JSON、完整性验证、正文响应上限和本机路径隔离。

## 非目标

- 不增加通用执行资源 Inventory、资源表或文件系统扫描。
- 不提供 cleanup、GC、Doctor、failure resolution mutation、CLI 或正文下载。
- 不复制或替代 Verification Result、Finish current/terminal 与各 owner 的执行资源 authority。

## 受影响用户或角色

主要面向通过 Local App 检查正式 Task 进展、失败与交付执行的开发者和 Agent 操作者。

## 核心流程

用户进入 Task 的证据页，默认读取全部 execution records，可切换 Verification 或 Finish；也可从 Verification Result、Finish current/terminal 区块直接进入对应筛选。选择记录后读取 portable detail，只有选择 manifest 声明的正文文件时才请求限量内容。

## 关键变化

- Application 从现有 authority 投影 closed portable read model。
- body store 以 record identity 派生目录并验证 manifest/digest/size，只返回最多 512 KiB preview。
- Local App HTTP 通过 bounded read worker 暴露只读 routes。
- React Web 复用一个浏览器和同一 record identity 实现三个视图与多个入口。

## 影响、风险与兼容性

无数据库迁移或 writer 变化，现有 API 保持兼容。主要风险是日志读取阻塞和路径泄漏；通过 bounded worker、closed filename、Application 白名单投影、完整性校验与固定响应上限控制。

## 验收摘要

全部/Verification/Finish 列表、单条详情、有效/cleaned/损坏正文、专业入口与公共 JSON 契约均有测试；OpenSpec strict、前端 build、受影响 Local App system/browser 验证通过，且响应中没有 locator、绝对路径或 mutation。

## 技术 Artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Task Execution Record delta](specs/task-execution-artifacts/spec.md)
- [Local App HTTP delta](specs/local-workspace-application/spec.md)
- [Local App Web delta](specs/local-app-web-client/spec.md)
- [Public JSON delta](specs/public-json-contracts/spec.md)
