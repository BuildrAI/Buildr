---
name: ui-prototype
description: 用户已明确确认需要在正式前端开发前查看本次提案实施后的完整页面原型时使用；调查现有真实界面，生成并在浏览器验证一个或多个自包含 HTML。未明确确认时不得使用。
---

# UI Prototype

本 Skill 只生成“界面原型（UI Prototype）”：它把当前提案或设计中的 UI 变化放回系统现有完整页面中，供用户、设计师和后续 Agent 在正式开发前对齐预期。

它不是正式设计稿、生产原型、像素级验收标准、canonical spec 或 Task Verification evidence，也不在真实前端工程中实现编码式原型。正式行为与验收继续由 specs、design、项目实现和正式验证事实决定。

## 1. 确认执行前提

只有当前对话中存在用户对本次任务“需要 UI Prototype”的明确确认，才继续执行。拒绝、没有回答、只说继续任务或历史任务曾经需要原型都不构成确认；此时返回 `not-requested`，不创建占位文件、不写 waiver/Result/Receipt，也不阻塞原任务。

读取当前 Task 的 intent、Project/Service scope、关联 Change，以及适用的 proposal、design、delta specs 和 current knowledge。正式 Task 需要在 Buildr Web 中展示时，必须已有 Task 关联 OpenSpec Change；文件写入该 Change 内由当前任务决定的目录。不得为原型新增 Task Record 字段、数据库状态、descriptor/schema、CLI 或固定目录。

## 2. 调查现有真实界面

先建立与本次变化直接相关的现有 UI 事实：

- 读取 Project/Service `AGENTS.md` 与前端运行、构建和验证说明；
- 查找真实页面入口、route、组件树、布局、样式 token、组件库、文案和交互；
- 按需要启动或复用现有前端，在浏览器中查看目标页面及其完整上下文；
- 记录本次变化会保留、移动、增加或替换的页面内容，以及必须覆盖的关键状态。

不要把调查笔记放进原型页面。若页面、运行环境或必要 UI 事实不可访问，先向用户说明缺失事实和影响，停止生成；不得凭空声称延续了现有产品。

## 3. 确定最小原型范围

按当前方案选择真正需要展示的页面和状态，不固定文件数量、目录或状态切换方式。只修改一个模块时，也必须把它放回现有导航、页面框架、相邻模块和真实信息层级中，交付修改后的完整页面，不能只交付孤立组件。

核心流程可以由一个页面和本地状态切换完整表达时生成一个页面；流程跨越多个页面、且不能由单页可靠表达时，必须生成多个原型页面。使用静态/mock 数据，不连接真实后端，不读取 secret，不执行真实写入。原型中的按钮、筛选、Tab、弹层或状态切换可以用本地 JavaScript 模拟关键交互。

## 4. 生成自包含 HTML

每个页面必须：

- 是含 `<!doctype html>`、`<html>`、`<head>`、用户可读 `<title>` 和 `<body>` 的完整 HTML；
- 在文件中包含精确发现标记 `<!-- buildr:ui-prototype -->`；
- 将必要 CSS 与 JavaScript 内联，将图片、字体和媒体限制为内联或 `data:` / `blob:` 资源；
- 不引用 CDN、远程脚本、远程字体、远程 API 或机器绝对路径；
- 延续调查所得的信息架构、页面框架、视觉语言、组件习惯和交互方式；
- 清楚表达必要的 loading、empty、error、disabled 或其他关键状态，但不虚构与提案无关的平台能力。

后续 Agent 可直接读取完整文件。不要把截图替代为交付物，也不要把调查事实、测试日志或解释文案覆盖在页面上。

## 5. 浏览器验证

使用当前 runtime 可用的浏览器能力逐一打开每个 HTML 文件：

1. 确认完整页面可见，没有依赖外部资源才能成立的缺口；
2. 操作本次提案的核心交互与关键状态；
3. 检查常用桌面 viewport；任务明确涉及窄屏时再检查对应 viewport；
4. 发现问题时修正 HTML 并重新验证。

没有浏览器能力或部分核心状态无法验证时，必须明确报告未验证范围，不能描述为已完整验证。不要用源代码检查或静态截图冒充浏览器交互验证。

## 6. 返回结果

返回：

```text
status: generated | blocked | not-requested
task: <task-id or none>
change: <project/change or none>
files: <portable paths or none>
pagesAndStates: <每个文件覆盖的页面、交互和状态>
browserVerification: <浏览器、viewport、已验证交互>
unverified: <none or explicit gaps>
referenceBoundary: 非正式设计、非生产原型、非像素级验收
```

用户确认后，有设计师参与时把全部文件作为设计输入。当前 Task 一旦生成一个或多个原型页面，后续 Agent 在正式前端编辑前必须读取全部相关原型，并按其信息架构、布局和交互开发；只有用户在当前任务中明确要求忽略原型时才可以不采用，且不得把该选择写成 Task 字段、waiver、Result、Receipt 或 blocker。

原型与 current design、delta specs 或 canonical behavior 冲突时，以正式 authority 为准，先明确差异并收敛正式 artifacts，不能让 HTML 静默覆盖规范。任何确认选择需要进入正式行为时，仍应写回 design、delta specs、Brief 或 tasks 等对应 authority，不能只留在原型中。
