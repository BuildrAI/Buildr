## Context

Buildr 已有正式 Task、Task-scoped OpenSpec Change read model、独立的 `buildr` / `buildr-web` Service，以及由 package 投射到 workspace 的 optional Skills。当前没有 UI Preview 的触发、产物或 Web 展示能力；`docs/roadmap/prototype-development.md` 描述的是未来在真实前端工程中制作编码式原型，不能承担本次轻量页面预演。

本能力同时影响 Agent 工作流、Change 文件读取、本机 HTTP API 与 React 任务详情。第一版必须保留用户明确选择、现有 UI 调查和浏览器验证，又不能引入预演生命周期平台、Task schema 扩张或可执行 HTML 的同源权限风险。

## Goals / Non-Goals

**Goals:**

- UI 影响任务先询问、明确确认后才生成，拒绝或未确认都不阻塞原任务。
- 基于现有真实界面与当前方案生成完整页面、自包含、可直接打开的 HTML。
- 让正式 Task 通过既有关联 Change 在 Buildr Web 中发现和查看一个或多个预演页面。
- 保持预演脚本可交互，同时隔离 Buildr Web 的 Origin、session 与网络访问。
- 以普通 optional Skill 落地，不建立 capability contract。

**Non-Goals:**

- 不建设预演稿数据库、状态机、CLI、固定目录、版本管理或发布平台。
- 不把 UI Preview 变成正式设计稿、生产原型、像素级验收或 Planning Identity。
- 不实现真实前端工程中的编码式原型，不恢复或替代已删除的 UI 视觉重构 Skill。
- 不为没有关联 OpenSpec Change 的 Task 新增第二种持久关联模型；该范围留待真实使用反馈。

## Decisions

### 1. 由现有工作流询问，独立 Skill 执行

Task Triage、Task Development 与 Buildr 的 OpenSpec contribution 在识别到潜在 UI 变化时提出一次清晰问题。只有当前对话中存在用户明确确认，才调用 `ui-preview`；拒绝、忽略或继续推进均不生成预演稿，也不形成 Development gate 或持久状态。

`ui-preview` 作为 package 内置 optional Skill 投射到 `skills/buildr/ui-preview`。它没有稳定 consumer、替换协议或机器 Result 的需求，因此第一版不声明 `provides`、`requires` 或 capability contract。相比把流程并入 Task Triage 或编码式原型 Skill，独立 Skill 更能保持触发判断与专业生成动作分离。

### 2. 使用 Change 内任意目录的自包含 HTML 与轻量发现标记

Skill 根据任务实际情况决定文件数量、命名和目录；每个可被 Buildr Web 识别的页面必须是完整 HTML，并包含 `<!-- buildr:ui-preview -->` 标记与 `<title>`。正式 Task 的文件放在其已关联 OpenSpec Change 内，因此 Task→Change 关系继续是唯一持久关联，不新增 Task Record 字段、数据库表、manifest 或固定 `ui-preview/` 目录。

Change Application 只递归读取当前 Task-scoped working Change 中的普通 `.html` 文件，忽略符号链接、未标记文件和超出安全读取边界的文件，并返回 portable Change 内相对路径。目录扫描与大小/数量限制只是读路径保护，不规定作者目录结构。

备选方案包括固定目录、独立 descriptor/schema、Task Record 引用和 Environment 资源登记；它们都会过早固化资产生命周期或在 Task authority 中增加不必要状态，因此第一版不采用。

### 3. 复用 Task-scoped Change read model，以 Task 与不透明页面 ID 提供受限内容响应

新增只读 `GET /api/v1/tasks/:taskId/ui-previews`。Application 从 Task Record 的 Change 引用出发，继续使用 saved Environment current 选择候选工作副本或 retained/archived Change；列表 API 只返回不透明页面 ID、标题、Change、lifecycle、相对路径和不可用/跳过诊断，不在 JSON 中携带可执行 HTML。

具体页面只通过 `GET /api/v1/tasks/:taskId/ui-previews/:previewId` 返回；`previewId` 由 Project、Change 与 portable path 派生，调用方不能提交文件路径。响应自身强制 `Content-Security-Policy: sandbox allow-scripts` 与离线资源策略，即使直接打开也处于 opaque origin；同时只允许被同源 Buildr Web 嵌入。任务没有预演稿或关联 Change 暂不可用时返回可解释空态，不改变 Task 状态。

### 4. 在独立“预演”Tab 中隔离运行

Task 详情新增一级“预演”Tab，按需请求预演 read model；多页面以列表选择，当前页面从专用内容响应装入 iframe。iframe 使用 `sandbox="allow-scripts"`，不启用 `allow-same-origin`；响应 CSP 再次强制 opaque-origin sandbox，仅允许 inline style/script 与 data/blob 图像、字体和媒体，禁止网络连接、外部资源和父页面访问。由此保留按钮、状态切换等核心 JS 交互，同时预演代码无法读取 Buildr session 或调用同源 API。不能使用 `srcdoc` 或 `blob:` 替代该响应，因为本地 scheme 文档继承 Buildr Web 主页面 `script-src 'self'` 后会阻止预演的自包含内联交互。

预演视图持续提示其参考性质，并展示来源 Change 与相对文件路径。页面不写 Task、Change 或预演文件，也不把预演稿转换为生产验收证据。

### 5. Skill 的最小专业流程

Skill 按以下顺序执行：确认用户授权；读取 Task、proposal/design/spec 与相关 current knowledge；读取或运行现有前端并在浏览器观察目标页面；无法可靠判断时先报告；生成完整页面 HTML；在浏览器打开文件并验证展示、核心交互和关键状态；返回文件与验证边界。若只改一个模块，仍必须放回完整页面框架中呈现。

Skill 可以在后续正式开发中作为视觉与交互参考，但正式实现仍以 specs、design 和项目代码为 authority。

## Risks / Trade-offs

- [Change 递归扫描增加读取成本] → 只在用户打开“预演”Tab 时读取，并限制普通文件、深度、总候选数和单文件大小；超限形成可见诊断。
- [预演 HTML 含任意脚本] → 内容响应只接受 Task 与已发现的不透明页面 ID，并在 HTTP 层强制 CSP sandbox；iframe 再次使用不含 `allow-same-origin` 的 sandbox，禁止网络和 Buildr API 权限。
- [轻量标记可能被手工误用] → 只读取 Task 已关联 Change，未标记 HTML 完全忽略，并在 Skill 中集中维护标记约定。
- [没有 Change 的 UI Task 暂时无法在 Web 持久关联] → 第一版明确该限制，不以 Task schema 或固定全局目录补洞；根据后续真实任务再决定是否需要独立关联模型。
- [预演稿与正式实现发生漂移] → UI Preview 明确为非规范参考；方案或现有 UI 变化时由用户决定是否重新生成，不引入自动同步。

## Migration Plan

本变更全量为增量能力：旧 Task、旧 Change 和没有标记 HTML 的 workspace 保持原行为；“预演”Tab 显示空态。回滚时移除 optional Skill、工作流提示、只读 API 和 Tab 即可，不涉及数据迁移。

## Open Questions

第一版没有阻塞实现的问题。无 Change Task 的长期预演关联、正式设计工具交接和更丰富的页面组织留给实际使用反馈。
