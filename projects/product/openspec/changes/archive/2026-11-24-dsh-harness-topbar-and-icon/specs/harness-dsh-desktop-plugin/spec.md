## MODIFIED Requirements

### Requirement: Harness 仅替换 DSH 中栏

Harness MUST 保留 DSH 原生左栏、右栏及开合；在 macOS 下不得在系统窗口控件或收起左栏后的宿主按钮上布置可遮挡控件，不得永久增加带操作按钮的工具栏，同时 MUST 在中栏顶部安全留白区提供支持 DSH 原生窗口拖拽与双击放大/缩小的轻量工作台顶栏（展示 Buildr Harness 图标、名称、开发标识及当前工作空间名称，中间与右侧保留空白拖拽区，并在左栏收起时自动向右避让）。右栏开合和返回 DSH MUST 分别位于对话标题操作和更多菜单；桥接不出现绑定步骤。左栏打开原生会话或其他原生页面时 MUST 交回原生界面，不改写对话或重载保留的 Harness 输入。

#### Scenario: 原生导航与窗口调整
- **WHEN** 用户进入 Harness、折叠或展开两侧、在中栏顶栏空白处拖动或双击窗口，再从左栏打开原生会话并重新进入 Harness
- **THEN** Harness 主工作区只占中栏下方区域，macOS 顶部轻量顶栏清晰显示当前名称与工作空间且左栏收起时自动右移避让不遮挡系统红绿灯和左栏按钮，空白处可正常拖动窗口与双击放大/缩小 DSH，两侧仍由 DSH 管理，Harness 对话和草稿保持

### Requirement: 正式与开发入口使用相应 Harness

正式插件 SHALL 核对本机正式安装与启动身份，通过受认证桌面桥连接对应 Harness；开发插件 SHALL 显示 Buildr Harness Dev 并连接已明确配置的开发域。两者在 DSH 左侧入口均 SHALL 使用 Buildr Harness 官方彩色 H 品牌图标（无白底方框）。缺失、漂移或不兼容时 MUST 提供修复及复查入口，不静默安装、升级或接管其他实例。

#### Scenario: 先装插件后装 Harness

- **WHEN** 用户打开正式插件而正式 Harness 未就绪，随后按提示安装并重试
- **THEN** 插件 MUST 从缺失状态转为连接核验后的正式 Harness，无须重装插件
