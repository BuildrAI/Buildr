## Why

任务研发（Task Development）已经形成当前候选、门禁、推进决定和研发交接的唯一读取模型，但 Local App 仍只能分别查看任务记录、环境、审查和验证，用户无法直接判断任务是否已经形成候选以及能否进入收尾。若直接增加第五个并列页签，还会继续扩大以模块命名的扁平导航，并保留现有英文主标题和中英混杂文案。

## What Changes

- 在任务详情增加只读“研发”视图，通过 Task Development Application `inspect` 展示当前结论、输入适用性、候选代次、三个门禁、推进决定、明确风险和最新研发交接
- 将任务详情一级导航收敛为“概览、研发、证据、环境”，把既有审查结果和验证结果组合到同一“证据”页，不改变各自 Application、Result 或 authority
- 为 Task Development 增加 Workspace-scoped、no-store 的 Local App 只读 API；不增加公共 CLI、写接口或直接 Receipt 读取
- 对任务详情当前可见文案执行中文优先收敛：高频界面使用纯中文，专业术语首次出现使用“中文（English Term）”，协议字段和精确技术标识保留英文并附中文主称
- 覆盖 Development missing、current、stale、unknown、Environment 已清理但历史交接保留，以及 Review/Verification 既有读取能力未回归的浏览器与接口场景
- 不包含破坏性 API 或持久数据变更

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `task-development`: 开放只读 Local App inspect 投影，同时保持 Application 单一 reader/writer、无公共 Development CLI 和无 mutation surface
- `task-record`: 重组任务详情一级信息架构，并把既有 Task Review 投影从独立一级页签迁移到“证据”页
- `local-workspace-application`: 把 Verification 从独立一级页签迁移到“证据”页，并将中文主称约束扩展到任务详情专业术语和状态文案

## Impact

- Product OpenSpec：任务研发、任务记录和本机应用规范
- Local App HTTP/runtime：新增 Task Development Application 只读依赖与 Workspace-scoped `GET` 路由
- Local App Web：任务详情导航、研发视图、证据组合视图和中文优先文案
- 随包 Skill：更新 `task-development` 的 Local App 只读投影边界，保持无公共 CLI 和无 Development 写操作
- 产品测试：Application/HTTP/browser smoke、只读边界、unknown/历史交接展示与既有审查/验证回归
- Current knowledge：Change Brief、任务生命周期 Roadmap 的 Local App 投影状态和 glossary 中本次涉及的英文-only 术语
