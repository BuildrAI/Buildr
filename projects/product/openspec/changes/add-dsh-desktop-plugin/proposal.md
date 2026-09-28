## Why

用户需要在 DSH 桌面版保留当前对话的同时打开 Buildr Web，而不是维护一份临时本机扩展或切换主页面。现有 Buildr 已拥有安装身份、公开健康查询与启动器（Launcher），本次以薄插件（Plugin）接入这些能力，并把交付维护归入智能体运行时适配器（Agent Runtime Adapter）。

## What Changes

- 在 DSH 侧栏底部、Settings 旁通过官方已发布动作席位 `sidebar.footer.action` 提供原生一致的 Buildr 独立动作按钮；该席位在官方 `0.1.7-rc.2`（提交 `477b4f42`）明文已声明，`replaceRisk: none`，因此不需要修改 DSH 源码，也不需要替换侧栏外壳。最初指定的“新会话下方、插件上方”位置另需候选席位 `sidebar.action`，采用它需要自建并替换桌面应用，本版不采用并如实标注位置差异。
- 点击时保留中间对话，按绑定的安装渠道与身份复用或启动 Buildr Web，只接受公开健康查询中 `status === "ready"` 的目标实例地址，在右侧内置浏览器打开并优先复用已有页面。
- 提供有界启动等待、清楚的失败与重试、无可用会话（Session）的不可用提示，以及禁用和卸载的资源清理；不停止已有 Buildr Web、不删除业务数据。
- 由 Buildr 产品工程维护插件（Plugin）源资产、测试和兼容边界；通过 DSH 自身支持的管理机制交付，不改写应用安装包或受管配置。
- 核对 DSH 的规则（Rule）、技能（Skill）发现与激活事实，满足现有五项能力契约（Contract）后才登记独立适配器（Adapter）；按钮可见不能证明完整运行时接入。对不具备受支持安装路径的部分报告具体缺口，不伪造自动维护。
- 不包含破坏性变更，不新增任务/对话同步、智能体调度、通用管理框架，也不承诺网页版与桌面版具有相同承载能力。

## Capabilities

### New Capabilities

- `dsh-desktop-integration`: 指定位置的独立入口、安装身份绑定、启动与健康地址发现、右侧页面复用、异常处理及插件（Plugin）交付维护边界。

### Modified Capabilities

- `workspace-first-runtime-projection`: 保留 DSH 真实运行时标识并交由标准适配器（Standard Adapter）承载规则（Rule）与技能（Skill）投射，区分文件投射、插件（Plugin）激活和真实会话（Session）消费证据；不新增独立 `dsh` 适配器（Adapter）。

## Impact

- 主要实现职责仍属于 `product/buildr`，不新增服务（Service）或独立仓库。直接交付运行时（Runtime）的文件型源资产归 `services/buildr/resources/runtime/`，工程工具归 `services/buildr/tools/`，生成结果归忽略的 `build/`。
- 复用 `installation status --json`、已验证的安装入口与启动器（Launcher），不读取含秘密的内部回执、不猜端口、不从 DSH 来源（Origin）代发业务写请求。
- 保留 Buildr 的 `frame-ancestors 'none'` 和 `X-Frame-Options: DENY`；网页视图（WebView）加载和正常导航必须在真实 DSH 桌面版另行验收。
- 当前 DSH 的 `sidebar.panellist` 仅提供主页面图标，行点击固定导航；官方已发布的 `sidebar.footer.action` 是位置不同的动作席位，本版采用它并以位置差异如实标注；不修改 DSH 本身、不重写侧栏、不替换用户当前应用。
- 当前 Buildr 支持清单中没有独立 DSH 适配器（Adapter）：最新 `dev` 已归档标准适配器变更，`dsh` 映射到 `agents-standard`。开发、测试在本任务隔离位置进行，不把正式安装重新绑定到开发源码，不运行正式自举同步，不发布或推送。
