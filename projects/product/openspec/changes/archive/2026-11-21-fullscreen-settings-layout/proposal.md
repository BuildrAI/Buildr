## Why

当前在独立 Buildr Harness Web 与 Buildr Development 专注模式下打开设置时，左侧仍常驻“对话列表”和宽度分隔条，进入「模型」后形成多栏并排嵌套、分散注意力；同时总标题「智能体与模型」及枚举式副标题已滞后于「模型 / 智能体 / 程序接入 / 系统提示词」四个一级设置模块，宽屏下无二级栏的单栏设置页也缺少舒适阅读宽度约束。按用户确认的原型与最终方案，需要将全屏设置改为保留最左图标导轨的两级左侧导航整屏布局，并统一收口设置标题与提示文案。

## What Changes

- 独立 Buildr Harness 与 Development 专注模式打开设置时，保留最左 52px 唯一侧边导轨，隐藏左侧对话列表与宽度分隔条而不改写其展开偏好、宽度、筛选和草稿；退出设置后原样恢复对话现场与列表状态。
- 全屏设置改用从左到右的两级左侧导航：最左为一级设置分类（模型、智能体、程序接入、系统提示词，其中“模型”不显示右侧箭头）；选中「模型」时紧邻向右展开分组供应商二级菜单与右侧详情区且各自独立滚动；切到无二级菜单的分类时二级栏自动收起，单栏正文贴左并在舒适阅读宽度内展示；窄屏下折叠为顶部横向导航。
- 统一将设置入口、全屏设置页与 Development 普通分屏设置抽屉的标题收口为「设置」，去掉枚举式副标题与冗余「返回对话」文字按钮；全屏设置顶栏展示当前路径与右上角 `×`（关闭设置），支持 `Esc` 快捷键、导轨图标和外部对话动作退出。
- 同步调整相关应用提示文案、单元测试、浏览器端到端测试及产品架构说明文档。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `harness-web-composition`: 修改「Development 专注模式必须提供就近的设置、额度和对话入口」需求，规范全屏两级左侧导航设置布局、左导轨交互语义、设置名称统一收口及列表状态保留行为。

## Impact

- 关联任务：[任务说明](@task/fullscreen-settings-layout)
- 受影响源码与测试：`services/buildr-harness-web`、`services/buildr-harness`、`services/buildr-web/test/browser`、`services/buildr/test/e2e`
- 受影响知识文档：`knowledge/docs/architecture/agent-integration.md`
- 兼容性：无外部 HTTP/CLI 契约破坏性变更，仅调整前端展示结构、局部交互语义与文案。
