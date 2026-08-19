# UI Preview 能力 Brief

## 一句话摘要

Buildr 在用户明确需要时，基于现有真实界面生成完整页面 HTML 预演稿，并允许在 Task 详情中安全查看。

## 背景与问题

UI 相关提案在正式开发前缺少低成本的完整页面对齐物。孤立组件或脱离现有产品的重新设计不能说明变化放回真实页面后的效果，而直接进入正式前端或编码式原型又会过早增加实现成本。

## 目标

- UI 影响任务主动询问、用户明确确认后才生成预演稿。
- 预演稿延续现有 UI，交付一个或多个完整、自包含、可交互 HTML。
- 浏览器验证后返回文件，并在 Buildr Web Task 详情中只读展示。
- 第一版不增加数据库状态、CLI、固定目录或 capability contract。

## 非目标

- 正式设计稿、生产原型或像素级视觉验收。
- 在真实前端工程中实现编码式原型。
- 恢复或替代已删除的 UI 视觉重构 Skill。
- 建设预演稿生命周期或发布平台。

## 受影响用户与角色

- 提出 UI 相关任务并需要在开发前确认完整页面效果的用户。
- 将预演稿继续深化为正式设计的设计师。
- 没有设计师参与时，以预演稿作为视觉与交互参考的后续 Agent。

## 核心流程

1. Agent 判断 Task、proposal 或 design 可能改变前端 UI，并询问是否需要 UI Preview。
2. 用户未明确确认时，原任务继续且不生成文件；明确确认后调用 `ui-preview`。
3. Skill 调查真实页面、路由、组件、样式、布局与交互；无法可靠判断时先报告。
4. Skill 在 Task 关联 Change 内按任务实际需要生成带发现标记的完整自包含 HTML，并在浏览器验证。
5. 用户、设计师或后续 Agent 可直接打开文件；Buildr Web 的 Task“预演”Tab 通过 Change 关联发现并隔离展示页面。

## 关键变化

- 新增 optional `ui-preview` Skill 与非阻塞工作流触发。
- Change Application 新增带标记 HTML 的安全只读发现能力。
- Buildr Web Task 详情新增“预演”Tab 与 sandbox iframe。
- 新增 UI Preview canonical terminology，并明确与编码式原型的边界。

## 影响、风险与兼容性

旧 Task 与 Change 无需迁移；没有带标记 HTML 时只显示空态。主要风险是递归读取成本和可执行 HTML 安全，分别通过按需有界扫描、普通文件检查、opaque-origin sandbox 与离线 CSP 控制。没有 Change 的 Task 第一版不建立持久关联。

## 验收摘要

- UI Preview 只在明确确认后生成，跳过时不阻塞。
- Skill 能基于真实界面生成完整、自包含页面并完成浏览器验证。
- Task-scoped API 只返回关联 Change 中带标记的安全普通 HTML。
- Web 可选择和操作预演页面，同时脚本不能访问父页面、session 或网络。
- Skill、API、React 构建和生产托管浏览器路径通过适用验证。

## 技术 Artifacts

- `proposal.md`
- `design.md`
- `specs/ui-preview/spec.md`
- `specs/product-agent-skills/spec.md`
- `specs/local-app-web-client/spec.md`
- `tasks.md`
